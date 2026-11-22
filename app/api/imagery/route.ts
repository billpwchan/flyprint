import { clientAddress, fail } from "../../lib/server/http";
import { cityImage, hasCityImage, metroFor, type ImageKind } from "../../lib/server/imagery";

// A city from above: ?at=AMS&kind=wide|square. Pictures already made are
// served to anyone; making a new one counts against the asker's hour.
const MAKES_PER_HOUR = 120;
const made = new Map<string, number[]>();

function mayMake(address: string) {
  const now = Date.now();
  const times = (made.get(address) ?? []).filter((t) => now - t < 3_600_000);
  if (times.length >= MAKES_PER_HOUR) return false;
  times.push(now);
  made.set(address, times);
  if (made.size > 5000) made.clear();
  return true;
}

export const GET = async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const metro = metroFor((params.get("at") ?? "").toUpperCase());
  const kind = params.get("kind") as ImageKind;
  if (!metro || (kind !== "wide" && kind !== "square")) return fail("at");
  if (!hasCityImage(metro, kind) && !mayMake(clientAddress(request))) return fail("busy", 429);
  const image = await cityImage(metro, kind);
  if (!image) return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=3600" } });
  return new Response(new Uint8Array(image), {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
  });
};
