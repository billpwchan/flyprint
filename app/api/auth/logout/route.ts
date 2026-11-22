import { clearedCookie, endSession, removeGuest, userForToken } from "../../../lib/server/auth";
import { fail, isSecure, json, sameOrigin, sessionToken } from "../../../lib/server/http";
import { database } from "../../../lib/server/db";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("origin", 403);
  database();
  const token = sessionToken(request);
  // Ending a trial deletes it: nobody could sign in to it again.
  const user = userForToken(token);
  if (user?.guest) removeGuest(user.id);
  else if (token) endSession(token);
  return json({ ok: true }, 200, { "set-cookie": clearedCookie(isSecure(request)) });
}
