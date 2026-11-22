import { demoArchive } from "../../lib/server/archive";
import { shareImage } from "../../lib/server/shareImage";

// The picture the site itself unfurls into: the sample traveller's routes,
// drawn like anyone's public page.
export async function GET() {
  const png = await shareImage("sample", demoArchive());
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
}
