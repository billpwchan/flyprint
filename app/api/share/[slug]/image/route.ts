import { sharedArchive } from "../../../../lib/server/archive";
import { shareImage } from "../../../../lib/server/shareImage";

// The preview a shared link unfurls into. Public, like the page it belongs to.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const archive = sharedArchive(slug);
  if (!archive) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const png = await shareImage(slug, archive);
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=300" } });
}
