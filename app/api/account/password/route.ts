import { allowAttempt, clearAttempts, endOtherSessions, findUserByEmail, hashPassword, passwordProblem, verifyPassword } from "../../../lib/server/auth";
import { database } from "../../../lib/server/db";
import { body, fail, json, sessionToken, signedIn, text } from "../../../lib/server/http";

export const POST = signedIn(async (request, user) => {
  const input = await body<{ current: string; next: string }>(request);
  if (!allowAttempt([[`password:${user.id}`, 8]])) return fail("throttled", 429);
  const stored = findUserByEmail(user.email);
  if (!stored || !(await verifyPassword(text(input.current, 300), stored.password))) return fail("credentials", 401);
  clearAttempts([`password:${user.id}`]);
  const next = text(input.next, 300);
  const problem = passwordProblem(next);
  if (problem) return fail(`password_${problem}`);
  database().prepare("UPDATE users SET password = ? WHERE id = ?").run(await hashPassword(next), user.id);
  database().prepare("DELETE FROM resets WHERE user_id = ?").run(user.id);
  // Other devices sign in again with the new password.
  endOtherSessions(user.id, sessionToken(request) ?? "");
  return json({ ok: true });
});
