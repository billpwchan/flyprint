import { siteOrigin } from "../lib/request";

// Public pages may be fetched for link previews; accounts and the API are not for crawling.
export async function GET() {
  const origin = await siteOrigin();
  const body = [
    "User-agent: *",
    "Allow: /",
    "Allow: /api/share/",
    "Allow: /api/og",
    "Disallow: /api/",
    "Disallow: /settings",
    "Disallow: /import",
    "Disallow: /join/",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
