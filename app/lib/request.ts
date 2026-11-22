import { headers } from "next/headers";
import { ui } from "./copy";
import { brandName, type Locale } from "./i18n";

type Copy = (typeof ui)[Locale];

export function localeFrom(cookieHeader: string, acceptLanguage: string): Locale {
  const cookie = cookieHeader.match(/(?:^|;\s*)flight-atlas-locale=(zh-Hans|zh-Hant|en)(?:;|$)/)?.[1];
  if (cookie === "zh-Hans" || cookie === "zh-Hant" || cookie === "en") return cookie;
  // The reader's first preference decides: "en-GB, zh-CN;q=0.1" reads English.
  const ranked = acceptLanguage.split(",")
    .map((entry, order) => {
      const [tag, ...params] = entry.trim().toLowerCase().split(";");
      const q = Number(params.find((param) => param.trim().startsWith("q="))?.trim().slice(2) ?? 1);
      return { tag, q: Number.isFinite(q) ? q : 0, order };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.order - b.order);
  const first = ranked[0]?.tag;
  if (!first) return "zh-Hans";
  if (/^zh-(hant|hk|tw|mo)\b/.test(first)) return "zh-Hant";
  if (first === "zh" || first.startsWith("zh-")) return "zh-Hans";
  return "en";
}

// The reader's time zone as their browser last reported it, so the first
// render already counts days to a flight from their own calendar.
export function zoneFrom(cookieHeader: string) {
  // Cookie names predate the rename; changing one would reset every reader.
  const raw = cookieHeader.match(/(?:^|;\s*)waypoint-zone=([A-Za-z0-9_+\-/%]{1,64})(?:;|$)/)?.[1];
  if (!raw) return null;
  try {
    const zone = decodeURIComponent(raw);
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

export async function requestLocale() {
  const request = await headers();
  return localeFrom(request.get("cookie") || "", request.get("accept-language") || "");
}

// Tab titles read in the reader's language and name the thing on screen.
export async function pageTitle(name: (text: Copy, locale: Locale) => string | null) {
  const locale = await requestLocale();
  const value = name(ui[locale], locale);
  return value ? `${value} — ${brandName[locale]}` : brandName[locale];
}

// A server page's own title, followed by the product's name in the reader's language.
export async function titled(value: string) {
  return `${value} — ${brandName[await requestLocale()]}`;
}

// The address this site is reached at, for links that leave the page (link
// previews, the sitemap). FLYPRINT_ORIGIN pins it when set.
export async function siteOrigin() {
  const pinned = process.env.FLYPRINT_ORIGIN?.replace(/\/+$/, "");
  if (pinned) return pinned;
  const request = await headers();
  const host = request.get("x-forwarded-host")?.split(",")[0].trim() || request.get("host") || "localhost:3000";
  const protocol = (request.get("x-forwarded-proto") || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https")).split(",")[0].trim();
  return `${protocol}://${host}`;
}
