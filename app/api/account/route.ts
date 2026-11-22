import { allowAttempt, clearedCookie, findUserByEmail, verifyPassword } from "../../lib/server/auth";
import { invitations, linksOf } from "../../lib/server/links";
import { database } from "../../lib/server/db";
import { flightCount } from "../../lib/server/flights";
import { importsOf } from "../../lib/server/imports";
import { body, fail, isSecure, json, signedIn, text } from "../../lib/server/http";
import { TONES, toneBeside } from "../../lib/palette";

export const GET = signedIn((_request, user) => {
  const { sent, received } = invitations(user.id);
  const person = (entry: { id: string; name: string; label: string; email: string }) => ({ id: entry.id, name: entry.name, label: entry.label, email: entry.email });
  return json({
    user: { id: user.id, name: user.name, label: user.label, email: user.email, tone: user.tone, flights: flightCount(user.id) },
    links: linksOf(user.id).map((link) => ({ ...person(link), tone: toneBeside(user.tone, link.tone), mine: link.mine, theirs: link.theirs })),
    sent: sent.map(person),
    received: received.map(person),
    imports: importsOf(user.id),
  });
}, { write: false });

export const PATCH = signedIn(async (request, user) => {
  const input = await body<{ name: string; label: string; tone: number }>(request);
  const name = text(input.name, 40).trim(), label = text(input.label, 3).trim();
  if (input.name !== undefined && !name) return fail("name");
  if (input.label !== undefined && !label) return fail("label");
  const tone = input.tone === undefined ? null : Number.isInteger(input.tone) && input.tone >= 0 && input.tone < TONES ? input.tone : -1;
  if (tone === -1) return fail("tone");
  database().prepare("UPDATE users SET name = COALESCE(?, name), label = COALESCE(?, label), tone = COALESCE(?, tone) WHERE id = ?").run(input.name !== undefined ? name : null, input.label !== undefined ? label : null, tone, user.id);
  return json({ ok: true });
});

// Closing an account removes its flights, imports and sessions with it.
export const DELETE = signedIn(async (request, user) => {
  const input = await body<{ password: string }>(request);
  if (!allowAttempt([[`password:${user.id}`, 8]])) return fail("throttled", 429);
  const stored = findUserByEmail(user.email);
  if (!stored || !(await verifyPassword(text(input.password, 300), stored.password))) return fail("credentials", 401);
  database().prepare("DELETE FROM users WHERE id = ?").run(user.id);
  return json({ ok: true }, 200, { "set-cookie": clearedCookie(isSecure(request)) });
});
