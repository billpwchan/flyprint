import { randomBytes } from "node:crypto";
import { database } from "../../../lib/server/db";
import { body, fail, json, signedIn } from "../../../lib/server/http";

// Lowercase letters and digits without the ones people misread (0/o, 1/l/i).
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const newSlug = () => [...randomBytes(16)].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");

const shareOf = (userId: string) => (database().prepare("SELECT share FROM users WHERE id = ?").get(userId) as { share: string | null } | undefined)?.share ?? null;

export const GET = signedIn((_request, user) => json({ share: shareOf(user.id) }), { write: false });

// Turning the page on keeps an existing address; turning it off retires it,
// so turning it on again gives a new one that old copies of the link don't reach.
export const POST = signedIn(async (request, user) => {
  const input = await body<{ on: boolean }>(request);
  if (input.on !== true) {
    database().prepare("UPDATE users SET share = NULL WHERE id = ?").run(user.id);
    return json({ share: null });
  }
  // A trial has no name to put on a page and may be gone within the week.
  if (user.guest) return fail("guest", 403);
  const existing = shareOf(user.id);
  if (existing) return json({ share: existing });
  const slug = newSlug();
  database().prepare("UPDATE users SET share = ? WHERE id = ?").run(slug, user.id);
  return json({ share: slug });
});
