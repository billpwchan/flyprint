import { randomBytes } from "node:crypto";
import type { Sharing } from "../data";
import { digest, normalizeEmail } from "./auth";
import { database, now, transaction } from "./db";

// Two accounts can link: one invites the other by email or with a one-time
// address, the other accepts. Each account keeps only its own flights; a link
// adds a page of the flights both logged, and each side chooses whether the
// other may also see the rest of their routes. Either side can unlink.

type Person = { id: string; name: string; label: string; email: string; tone: number };
export type Linked = Person & { mine: Sharing; theirs: Sharing };

// Links and unanswered invitations one account may hold.
const MAX_LINKS = 20;
const INVITE_DAYS = 7;

export function linksOf(userId: string): Linked[] {
  return database().prepare(
    `SELECT u.id, u.name, u.label, u.email, u.tone, mine.shares AS mine, theirs.shares AS theirs
     FROM companions mine
     JOIN companions theirs ON theirs.user_id = mine.companion_id AND theirs.companion_id = mine.user_id AND theirs.status = 'linked'
     JOIN users u ON u.id = mine.companion_id
     WHERE mine.user_id = ? AND mine.status = 'linked'
     ORDER BY mine.created_at, u.id`,
  ).all(userId) as Linked[];
}

export const linkBetween = (userId: string, otherId: string) => linksOf(userId).find((link) => link.id === otherId) ?? null;

// Invitations this reader sent and has not had answered, and ones waiting for them.
export function invitations(userId: string) {
  const db = database();
  const sent = db.prepare("SELECT u.id, u.name, u.label, u.email, u.tone FROM companions c JOIN users u ON u.id = c.companion_id WHERE c.user_id = ? AND c.status = 'invited' ORDER BY c.created_at").all(userId) as Person[];
  const received = db.prepare("SELECT u.id, u.name, u.label, u.email, u.tone FROM companions c JOIN users u ON u.id = c.user_id WHERE c.companion_id = ? AND c.status = 'invited' ORDER BY c.created_at").all(userId) as Person[];
  return { sent, received };
}

export const waitingFor = (userId: string) => (database().prepare("SELECT COUNT(*) AS count FROM companions WHERE companion_id = ? AND status = 'invited'").get(userId) as { count: number }).count;

const held = (userId: string) => (database().prepare("SELECT COUNT(*) AS count FROM companions WHERE user_id = ?").get(userId) as { count: number }).count;
const linked = (a: string, b: string) => !!database().prepare("SELECT 1 FROM companions WHERE user_id = ? AND companion_id = ? AND status = 'linked'").get(a, b);

function link(a: string, b: string) {
  const db = database();
  db.prepare("DELETE FROM companions WHERE (user_id = ? AND companion_id = ?) OR (user_id = ? AND companion_id = ?)").run(a, b, b, a);
  const time = now();
  db.prepare("INSERT INTO companions (user_id, companion_id, status, shares, created_at) VALUES (?, ?, 'linked', 'together', ?), (?, ?, 'linked', 'together', ?)").run(a, b, time, b, a, time);
}

export type InviteResult = "invited" | "linked" | "self" | "unknown" | "already" | "full";

export function invite(userId: string, email: string): InviteResult {
  return transaction((db) => {
    const other = db.prepare("SELECT id FROM users WHERE email = ? AND guest = 0").get(normalizeEmail(email)) as { id: string } | undefined;
    if (!other) return "unknown";
    if (other.id === userId) return "self";
    if (linked(userId, other.id)) return "already";
    // They asked first: inviting back is accepting.
    if (db.prepare("SELECT 1 FROM companions WHERE user_id = ? AND companion_id = ? AND status = 'invited'").get(other.id, userId)) {
      if (held(userId) >= MAX_LINKS) return "full";
      link(other.id, userId);
      return "linked";
    }
    if (held(userId) >= MAX_LINKS) return "full";
    db.prepare("INSERT OR IGNORE INTO companions (user_id, companion_id, status, created_at) VALUES (?, ?, 'invited', ?)").run(userId, other.id, now());
    return "invited";
  });
}

export function accept(userId: string, inviterId: string): "linked" | "gone" | "full" {
  return transaction((db) => {
    const invitation = db.prepare("SELECT 1 FROM companions WHERE user_id = ? AND companion_id = ? AND status = 'invited'").get(inviterId, userId);
    if (!invitation) return "gone";
    if (held(userId) >= MAX_LINKS) return "full";
    link(inviterId, userId);
    return "linked";
  });
}

export function decline(userId: string, inviterId: string) {
  database().prepare("DELETE FROM companions WHERE user_id = ? AND companion_id = ? AND status = 'invited'").run(inviterId, userId);
}

export function cancelInvitation(userId: string, otherId: string) {
  database().prepare("DELETE FROM companions WHERE user_id = ? AND companion_id = ? AND status = 'invited'").run(userId, otherId);
}

export function unlink(userId: string, otherId: string) {
  database().prepare("DELETE FROM companions WHERE (user_id = ? AND companion_id = ?) OR (user_id = ? AND companion_id = ?)").run(userId, otherId, otherId, userId);
}

export function setSharing(userId: string, otherId: string, shares: Sharing) {
  return database().prepare("UPDATE companions SET shares = ? WHERE user_id = ? AND companion_id = ? AND status = 'linked'").run(shares, userId, otherId).changes > 0;
}

// An address to send to someone, signed up or not. It works once, for a week;
// making a new one retires the last. Only its hash is stored.
export function inviteToken(userId: string) {
  const token = randomBytes(24).toString("base64url");
  const time = now();
  transaction((db) => {
    db.prepare("DELETE FROM invites WHERE user_id = ? OR expires_at < ?").run(userId, time);
    db.prepare("INSERT INTO invites (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(digest(token), userId, time, time + INVITE_DAYS * 86_400_000);
  });
  return token;
}

export function inviterOf(token: string): { id: string; name: string } | null {
  if (!token || token.length > 100) return null;
  const row = database().prepare("SELECT u.id, u.name, i.expires_at FROM invites i JOIN users u ON u.id = i.user_id WHERE i.token = ?").get(digest(token)) as { id: string; name: string; expires_at: number } | undefined;
  return row && row.expires_at > now() ? { id: row.id, name: row.name } : null;
}

export type JoinResult = { result: "linked" | "already"; with: string } | { result: "self" | "gone" | "full" };

export function join(userId: string, token: string): JoinResult {
  return transaction((db) => {
    const inviter = inviterOf(token);
    if (!inviter) return { result: "gone" };
    if (inviter.id === userId) return { result: "self" };
    if (linked(userId, inviter.id)) return { result: "already", with: inviter.id };
    if (held(userId) >= MAX_LINKS || held(inviter.id) >= MAX_LINKS) return { result: "full" };
    link(inviter.id, userId);
    db.prepare("DELETE FROM invites WHERE token = ?").run(digest(token));
    return { result: "linked", with: inviter.id };
  });
}

// Used by the first-run seed, which links two accounts it just created.
export const linkAccounts = (a: string, b: string) => transaction(() => link(a, b));
