import { BlockList, isIP } from "node:net";
import { GUEST_DAYS, SESSION_COOKIE, allowAttempt, createGuest, createSession, removeGuest, sessionCookie, userForToken, type User } from "./auth";
import { ARRIVAL_COOKIE, countTrial, validRef } from "./arrivals";
import { database } from "./db";

// Route handlers answer with an error code; the page words it in the reader's language.

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

export const fail = (code: string, status = 400) => json({ error: code }, status);

export const cookieValue = (request: Request, name: string) =>
  request.headers.get("cookie")?.split(/;\s*/).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;

// The iOS app says who it is and carries its session as a bearer token. It
// never holds this site's cookie, so nothing it sends is ambient. A page
// elsewhere cannot add the header without a preflight this site never grants,
// and whatever a browser sends carries Origin or Sec-Fetch-Site, which no page
// can remove: such a request is never the app's, even if CORS is opened later.
export const isAppRequest = (request: Request) =>
  request.headers.get("x-flyprint-client") === "ios" && !request.headers.get("cookie")
  && !request.headers.get("origin") && !request.headers.get("sec-fetch-site");

const bearer = (request: Request) => {
  const match = /^bearer\s+(\S+)\s*$/i.exec(request.headers.get("authorization") ?? "");
  return match ? match[1] : null;
};

export const sessionToken = (request: Request) =>
  (isAppRequest(request) ? bearer(request) : null) ?? cookieValue(request, SESSION_COOKIE);

// A new session reaches a page as a cookie and the app as a token in the body.
export const withSession = (request: Request, token: string, data: Record<string, unknown>, status = 200) =>
  isAppRequest(request) ? json({ ...data, token }, status) : json(data, status, { "set-cookie": sessionCookie(token, isSecure(request)) });

export const isSecure = (request: Request) => (request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "")).split(",")[0].trim() === "https";

// Writes come from this site's own pages: the browser says so in Origin
// (or Sec-Fetch-Site), which a page elsewhere cannot forge.
export function sameOrigin(request: Request) {
  if (isAppRequest(request)) return true;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return site === "same-origin" || site === "none";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try { return new URL(origin).host === host; } catch { return false; }
}

// Cloudflare's edge, from cloudflare.com/ips-v4 and /ips-v6 (2026-11). Behind
// its proxy every reader reaches the site from these few addresses, so the
// per-network limits would be shared by everyone near one data centre.
const CLOUDFLARE = new BlockList();
for (const range of [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
  "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
]) {
  const [network, bits] = range.split("/");
  CLOUDFLARE.addSubnet(network, Number(bits), network.includes(":") ? "ipv6" : "ipv4");
}
const plain = (address: string) => address.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
const fromCloudflare = (address: string) => {
  const kind = isIP(address);
  return kind !== 0 && CLOUDFLARE.check(address, kind === 6 ? "ipv6" : "ipv4");
};

// The address the site's own proxy saw: the last X-Forwarded-For entry, since
// anything before it was sent by the client and could be made up. When that
// address is Cloudflare's, the reader's own is in CF-Connecting-IP; from
// anywhere else that header is the client's word and is ignored.
export const clientAddress = (request: Request) => {
  const peer = plain((request.headers.get("x-forwarded-for") ?? "").split(",").at(-1)!.trim());
  const reader = plain(request.headers.get("cf-connecting-ip")?.trim() ?? "");
  if (peer && isIP(reader) && fromCloudflare(peer)) return reader;
  return peer || "local";
};

type Context = { params: Promise<Record<string, string>> };
type Handler = (request: Request, user: User, context: Context) => Promise<Response> | Response;

// A write by a signed-in reader from this site. trial: a visitor's first
// write (an import, a flight typed in) starts a trial account instead of
// being refused; the account stays only if the write succeeds.
const TRIALS_PER_NETWORK = 10;
export function signedIn(handler: Handler, { write = true, trial = false } = {}) {
  return async (request: Request, context: Context) => {
    if (write && !sameOrigin(request)) return fail("origin", 403);
    database();
    let user = userForToken(sessionToken(request));
    let started: string | null = null;
    if (!user && trial && !isAppRequest(request)) {
      if (!allowAttempt([[`trial:${clientAddress(request)}`, TRIALS_PER_NETWORK]], 60 * 60_000)) return fail("throttled", 429);
      user = createGuest();
      started = createSession(user.id, GUEST_DAYS);
    }
    if (!user) return fail("signed_out", 401);
    try {
      const response = await handler(request, user, context);
      if (started) {
        if (!response.ok) { removeGuest(user.id); return response; }
        const ref = validRef(cookieValue(request, ARRIVAL_COOKIE));
        if (ref) countTrial(ref);
        response.headers.append("set-cookie", sessionCookie(started, isSecure(request), GUEST_DAYS));
      }
      return response;
    } catch (error) {
      if (started) removeGuest(user.id);
      console.error(error);
      return fail("server", 500);
    }
  };
}

export async function body<T>(request: Request): Promise<Partial<T>> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Partial<T> : {};
  } catch { return {}; }
}

export const text = (value: unknown, max = 500) => typeof value === "string" ? value.slice(0, max) : "";
