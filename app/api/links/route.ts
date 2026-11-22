import { allowAttempt } from "../../lib/server/auth";
import { accept, cancelInvitation, decline, invite, inviteToken, join, setSharing, unlink } from "../../lib/server/links";
import { body, fail, json, signedIn, text } from "../../lib/server/http";

// invite { email } · accept { from } · decline { from } · cancel { to } ·
// unlink { with } · share { with, shares } · token · join { token }
export const POST = signedIn(async (request, user) => {
  // Linking is between two people with accounts.
  if (user.guest) return fail("guest", 403);
  const input = await body<{ action: string; email: string; from: string; to: string; with: string; shares: string; token: string }>(request);
  switch (input.action) {
    case "invite": {
      // An answer says whether an address has an account; asking costs time.
      if (!allowAttempt([[`invite:${user.id}`, 20]], 60 * 60_000)) return fail("throttled", 429);
      const result = invite(user.id, text(input.email, 254));
      return result === "invited" || result === "linked" ? json({ ok: true, result }) : fail(result);
    }
    case "accept": {
      const accepted = accept(user.id, text(input.from, 40));
      return accepted === "linked" ? json({ ok: true, result: accepted }) : fail(accepted);
    }
    case "decline": decline(user.id, text(input.from, 40)); return json({ ok: true });
    case "cancel": cancelInvitation(user.id, text(input.to, 40)); return json({ ok: true });
    case "unlink": unlink(user.id, text(input.with, 40)); return json({ ok: true });
    case "share": {
      const shares = input.shares === "all" ? "all" : input.shares === "together" ? "together" : null;
      if (!shares) return fail("action");
      return setSharing(user.id, text(input.with, 40), shares) ? json({ ok: true }) : fail("gone");
    }
    case "token": return json({ ok: true, token: inviteToken(user.id) });
    case "join": {
      if (!allowAttempt([[`join:${user.id}`, 20]], 60 * 60_000)) return fail("throttled", 429);
      const joined = join(user.id, text(input.token, 100));
      return "with" in joined ? json({ ok: true, ...joined }) : fail(joined.result);
    }
    default: return fail("action");
  }
});
