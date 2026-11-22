import { allowAttempt } from "../../lib/server/auth";
import { ARRIVAL_COOKIE, arrivalCookie, countVisit, validRef } from "../../lib/server/arrivals";
import { body, clientAddress, cookieValue, fail, isSecure, sameOrigin } from "../../lib/server/http";

// The page reports the ?ref= it was opened with. Link-preview fetchers run no
// script, so only readers who actually opened the page are counted.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("origin", 403);
  const ref = validRef((await body<{ ref: string }>(request)).ref);
  if (!ref) return fail("ref");
  if (!allowAttempt([[`arrive:${clientAddress(request)}`, 30]], 60 * 60_000)) return new Response(null, { status: 204 });
  countVisit(ref);
  // The first link someone came through is the one a later sign-up counts for.
  const first = !cookieValue(request, ARRIVAL_COOKIE);
  return new Response(null, { status: 204, headers: first ? { "set-cookie": arrivalCookie(ref, isSecure(request)) } : {} });
}
