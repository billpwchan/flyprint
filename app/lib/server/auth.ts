import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { database, newId, now, transaction, whenOpened } from "./db";
import { matchOf } from "./import/normalize";
import { TONES } from "../palette";

// Email and password accounts. Passwords are scrypt hashes; a session is a
// random token in an HttpOnly cookie, stored only as its SHA-256.

// Named before the rename; changing it would sign everyone out.
export const SESSION_COOKIE = "waypoint_session";
const SESSION_DAYS = 180;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

// tone: the person's colour on the globe, an index into palette.tones.
// guest: a trial account, with no address or password until it is kept.
export type User = { id: string; email: string; name: string; label: string; tone: number; created_at: number; guest: boolean };
export const GUEST_DAYS = 7;

function derive(password: string, salt: Buffer, params = SCRYPT) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, params.keylen, { N: params.N, r: params.r, p: params.p, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await derive(password, Buffer.from(salt, "base64url"), { N: Number(n), r: Number(r), p: Number(p), keylen: expected.length });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const passwordProblem = (password: string) => password.length < 8 ? "short" : password.length > 200 ? "long" : null;
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

export const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export function createSession(userId: string, days = SESSION_DAYS) {
  const token = randomBytes(32).toString("base64url");
  const created = now();
  database().prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(digest(token), userId, created, created + days * 86_400_000);
  return token;
}

export function endSession(token: string) {
  database().prepare("DELETE FROM sessions WHERE token = ?").run(digest(token));
}

export function endOtherSessions(userId: string, keep: string) {
  database().prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(userId, digest(keep));
}

export function userForToken(token: string | undefined | null): User | null {
  if (!token || token.length > 100) return null;
  const db = database();
  const row = db.prepare("SELECT u.id, u.email, u.name, u.label, u.tone, u.created_at, u.guest, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?").get(digest(token)) as (Omit<User, "guest"> & { guest: number; expires_at: number }) | undefined;
  if (!row) return null;
  if (row.expires_at < now()) { db.prepare("DELETE FROM sessions WHERE token = ?").run(digest(token)); return null; }
  return { id: row.id, email: row.email, name: row.name, label: row.label, tone: row.tone, created_at: row.created_at, guest: !!row.guest };
}

export function sessionCookie(token: string, secure: boolean, days = SESSION_DAYS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86_400}${secure ? "; Secure" : ""}`;
}

export const clearedCookie = (secure: boolean) => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;

// For server components: the reader behind this request, if signed in.
export async function currentUser() {
  const jar = await cookies();
  return userForToken(jar.get(SESSION_COOKIE)?.value);
}

export async function isSecureRequest() {
  const request = await headers();
  return (request.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https";
}

export function findUserByEmail(email: string) {
  const row = database().prepare("SELECT id, email, name, label, tone, created_at, password FROM users WHERE email = ? AND guest = 0").get(normalizeEmail(email)) as (Omit<User, "guest"> & { password: string }) | undefined;
  return row ? { ...row, guest: false } : undefined;
}

// The short mark a traveller goes by on the map: the first letter of their name.
export function labelFrom(name: string, email: string) {
  const source = (name.trim() || email).trim();
  const first = [...source][0] ?? "?";
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}

export async function createUser(input: { email: string; password: string; name: string; label?: string }) {
  const email = normalizeEmail(input.email);
  const name = input.name.trim().slice(0, 40) || email.split("@")[0];
  const password = await hashPassword(input.password);
  const db = database();
  // Accounts take the colours in turn, so two people who link rarely start alike.
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  const user: User = { id: newId("u_"), email, name, label: (input.label?.trim() || labelFrom(name, email)).slice(0, 3), tone: count % TONES, created_at: now(), guest: false };
  db.prepare("INSERT INTO users (id, email, password, name, label, tone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(user.id, user.email, password, user.name, user.label, user.tone, user.created_at);
  return user;
}

// A trial: someone imports before they have an account, and sees their own
// map. It has no address or password; signing up keeps it under the same id,
// signing in to an existing account moves its flights there, and one not kept
// within GUEST_DAYS is deleted with everything in it.
export function createGuest() {
  sweepGuests();
  const db = database();
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  const id = newId("u_");
  const user: User = { id, email: `${id}@guest.invalid`, name: "", label: "·", tone: count % TONES, created_at: now(), guest: true };
  db.prepare("INSERT INTO users (id, email, password, name, label, tone, created_at, guest) VALUES (?, ?, '', ?, ?, ?, ?, 1)").run(user.id, user.email, user.name, user.label, user.tone, user.created_at);
  return user;
}

export const guestDaysLeft = (user: Pick<User, "created_at">) => Math.max(1, Math.ceil((user.created_at + GUEST_DAYS * 86_400_000 - now()) / 86_400_000));

// Signing up from a trial: the same account gets an address and a password.
// Returns false when the address was taken in the meantime.
export async function keepGuest(guest: User, input: { email: string; password: string; name: string }) {
  const email = normalizeEmail(input.email);
  const name = input.name.trim().slice(0, 40) || email.split("@")[0];
  const password = await hashPassword(input.password);
  try {
    const kept = database().prepare("UPDATE users SET email = ?, password = ?, name = ?, label = ?, guest = 0 WHERE id = ? AND guest = 1").run(email, password, name, labelFrom(name, email), guest.id).changes;
    return kept ? { ...guest, email, name, label: labelFrom(name, email), guest: false } : null;
  } catch {
    return null;
  }
}

// Signing in from a trial: its flights join the account, except ones already
// there; then the trial goes.
export function absorbGuest(guestId: string, userId: string) {
  transaction((db) => {
    const logged = db.prepare("SELECT date, flight, origin, destination FROM flights WHERE user_id = ?").all(userId) as { date: string; flight: string; origin: string; destination: string }[];
    const tried = db.prepare("SELECT id, date, flight, origin, destination FROM flights WHERE user_id = ?").all(guestId) as { id: string; date: string; flight: string; origin: string; destination: string }[];
    // A flight whose id the account already uses stays behind and goes with the trial.
    const move = db.prepare("UPDATE OR IGNORE flights SET user_id = ? WHERE user_id = ? AND id = ?");
    for (const flight of tried) {
      if (matchOf(flight, logged)?.likely === false) continue;
      if (move.run(userId, guestId, flight.id).changes) logged.push(flight);
    }
    db.prepare("DELETE FROM users WHERE id = ? AND guest = 1").run(guestId);
  });
}

export const removeGuest = (guestId: string) => database().prepare("DELETE FROM users WHERE id = ? AND guest = 1").run(guestId);

export function sweepGuests() {
  database().prepare("DELETE FROM users WHERE guest = 1 AND created_at < ?").run(now() - GUEST_DAYS * 86_400_000);
}
whenOpened(() => {
  sweepGuests();
  setInterval(() => { try { sweepGuests(); } catch (error) { console.error("guest sweep failed", error); } }, 3_600_000).unref();
});

// Attempts per key within a window, so a guessed password costs time. An
// attempt counts before the password is checked, so parallel guesses count
// too. Returns false once any key has reached its limit.
const attempts = new Map<string, { count: number; until: number }>();
export function allowAttempt(limits: [key: string, limit: number][], windowMs = 15 * 60_000) {
  const time = now();
  for (const [key, entry] of attempts) if (entry.until < time) attempts.delete(key);
  if (limits.some(([key, limit]) => (attempts.get(key)?.count ?? 0) >= limit)) return false;
  for (const [key] of limits) {
    const entry = attempts.get(key);
    if (entry) entry.count++;
    else attempts.set(key, { count: 1, until: time + windowMs });
  }
  return true;
}
export const clearAttempts = (keys: string[]) => keys.forEach((key) => attempts.delete(key));
