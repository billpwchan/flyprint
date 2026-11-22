import { absorbGuest, allowAttempt, createSession, digest, hashPassword, passwordProblem, userForToken } from "../../../../lib/server/auth";
import { transaction } from "../../../../lib/server/db";
import { body, clientAddress, fail, sameOrigin, sessionToken, text, withSession } from "../../../../lib/server/http";

// Sets the new password from a mailed link. The link works once; every
// session the account had ends, and this browser (or the app) is signed in.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("origin", 403);
  if (!allowAttempt([[`reset-confirm:${clientAddress(request)}`, 20]])) return fail("throttled", 429);
  const input = await body<{ token: string; password: string }>(request);
  const token = text(input.token, 100), password = text(input.password, 300);
  const problem = passwordProblem(password);
  if (problem) return fail(`password_${problem}`);
  const hashed = await hashPassword(password);
  const userId = transaction((db) => {
    const row = db.prepare("SELECT user_id, expires_at FROM resets WHERE token = ?").get(digest(token)) as { user_id: string; expires_at: number } | undefined;
    if (!row) return null;
    // An old link going stale leaves a newer one working.
    if (row.expires_at < Date.now()) { db.prepare("DELETE FROM resets WHERE token = ?").run(digest(token)); return null; }
    db.prepare("DELETE FROM resets WHERE user_id = ?").run(row.user_id);
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashed, row.user_id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.user_id);
    return row.user_id;
  });
  if (!userId) return fail("expired", 410);
  // Back in from a trial: its flights come along, as on signing in.
  const trial = userForToken(sessionToken(request));
  if (trial?.guest && trial.id !== userId) absorbGuest(trial.id, userId);
  return withSession(request, createSession(userId), { ok: true });
}
