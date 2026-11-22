import { publicUi } from "../lib/copy-public";
import { brandName } from "../lib/i18n";
import { requestLocale } from "../lib/request";

// The name under the home-screen icon is the one the reader knows it by.
export async function GET() {
  const locale = await requestLocale();
  const manifest = {
    name: brandName[locale],
    short_name: brandName[locale],
    description: publicUi[locale].intro.meta,
    lang: locale,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#08090b",
    theme_color: "#08090b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600", vary: "Accept-Language, Cookie" },
  });
}
