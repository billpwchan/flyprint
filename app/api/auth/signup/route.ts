import { allowAttempt, createSession, createUser, endSession, findUserByEmail, isEmail, keepGuest, passwordProblem, userForToken } from "../../../lib/server/auth";
import { body, clientAddress, cookieValue, fail, sameOrigin, sessionToken, text, withSession } from "../../../lib/server/http";
import { ARRIVAL_COOKIE, countSignup, validRef } from "../../../lib/server/arrivals";
import { database } from "../../../lib/server/db";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("origin", 403);
  database();
  const input = await body<{ email: string; password: string; name: string }>(request);
  const email = text(input.email, 254).trim().toLowerCase(), password = text(input.password, 300), name = text(input.name, 60);
  if (!isEmail(email)) return fail("email");
  const problem = passwordProblem(password);
  if (problem) return fail(`password_${problem}`);
  // New accounts per network, so nobody mints thousands of them.
  if (!allowAttempt([[`signup:${clientAddress(request)}`, 10]], 60 * 60_000)) return fail("throttled", 429);
  if (findUserByEmail(email)) return fail("taken", 409);
  // From a trial, the trial's account is the one kept, flights and all; its
  // week-long session gives way to an ordinary one.
  const token = sessionToken(request);
  const trial = userForToken(token);
  let user;
  if (trial?.guest) {
    user = await keepGuest(trial, { email, password, name });
    if (!user) return fail("taken", 409);
    endSession(token!);
  } else {
    try { user = await createUser({ email, password, name }); }
    // Two sign-ups with one address at once: the second meets the unique email.
    catch { return fail("taken", 409); }
  }
  const ref = validRef(cookieValue(request, ARRIVAL_COOKIE));
  if (ref) countSignup(ref);
  return withSession(request, createSession(user.id), { ok: true, user: { id: user.id, name: user.name } }, 201);
}
