import { siteOrigin } from "../lib/request";

export async function GET() {
  const origin = await siteOrigin();
  const pages = ["/", "/signup", "/privacy", "/terms"];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join("\n")}
</urlset>
`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
