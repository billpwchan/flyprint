import { absorbGuest, allowAttempt, clearAttempts, createSession, endSession, findUserByEmail, userForToken, verifyPassword } from "../../../lib/server/auth";
import { body, clientAddress, fail, sameOrigin, sessionToken, text, withSession } from "../../../lib/server/http";
import { database } from "../../../lib/server/db";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("origin", 403);
  database();
  const input = await body<{ email: string; password: string }>(request);
  const email = text(input.email, 254).trim().toLowerCase(), password = text(input.password, 300);
  // Per account from one network, and per network: someone else guessing
  // cannot lock the owner out from their own network.
  const address = clientAddress(request), account = `login:${email}:${address}`;
  if (!allowAttempt([[account, 8], [`login-ip:${address}`, 30]])) return fail("throttled", 429);
  const user = findUserByEmail(email);
  const valid = user ? await verifyPassword(password, user.password) : false;
  if (!user || !valid) return fail("credentials", 401);
  clearAttempts([account]);
  // Signing in from a trial brings the trial's flights along.
  const token = sessionToken(request);
  const trial = userForToken(token);
  if (trial?.guest) { absorbGuest(trial.id, user.id); endSession(token!); }
  return withSession(request, createSession(user.id), { ok: true });
}
