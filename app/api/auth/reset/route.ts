import { randomBytes } from "node:crypto";
import { allowAttempt, digest, findUserByEmail, isEmail } from "../../../lib/server/auth";
import { database } from "../../../lib/server/db";
import { body, clientAddress, fail, json, sameOrigin, text } from "../../../lib/server/http";
import { mailConfigured, sendMail } from "../../../lib/server/mail";
import { publicUi } from "../../../lib/copy-public";
import { requestLocale, siteOrigin } from "../../../lib/request";

const HOUR = 3_600_000;

// Asks for a link to choose a new password. The answer is the same whether or
// not the address has an account, so the form cannot be used to find accounts.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("origin", 403);
  if (!mailConfigured()) return fail("unavailable", 404);
  const input = await body<{ email: string }>(request);
  const email = text(input.email, 254).trim().toLowerCase();
  if (!isEmail(email)) return fail("email");
  if (!allowAttempt([[`reset:${email}`, 3], [`reset:${clientAddress(request)}`, 10]], HOUR)) return fail("throttled", 429);
  const user = findUserByEmail(email);
  if (user) {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    const db = database();
    db.prepare("DELETE FROM resets WHERE user_id = ? OR expires_at < ?").run(user.id, now);
    db.prepare("INSERT INTO resets (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(digest(token), user.id, now, now + HOUR);
    const words = publicUi[await requestLocale()].reset;
    // Not awaited: an address with an account must answer as fast as one without.
    void sendMail({ to: user.email, subject: words.subject, text: words.mail(`${await siteOrigin()}/reset/${token}`) });
  }
  return json({ ok: true });
}
