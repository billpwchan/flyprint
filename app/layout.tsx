import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./app.css";
import LocaleProvider from "./components/LocaleProvider";
import ArchiveProvider from "./components/ArchiveProvider";
import { loadSession } from "./lib/server/archive";
import Shell from "./components/shell/Shell";
import { localeFrom, requestLocale, siteOrigin, zoneFrom } from "./lib/request";
import { publicUi } from "./lib/copy-public";
import { brandName } from "./lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const origin = await siteOrigin();
  const locale = await requestLocale();
  const title = brandName[locale];
  const description = publicUi[locale].intro.meta;
  const image = { url: `${origin}/api/og`, width: 1200, height: 630, alt: title };
  return {
    metadataBase: new URL(origin),
    title,
    description,
    applicationName: title,
    manifest: "/manifest.webmanifest",
    icons: { icon: "/favicon.svg", apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title, statusBarStyle: "black-translucent" },
    openGraph: { type: "website", siteName: title, url: origin, title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

// The globe runs under the notch and home indicator; the chrome and the sheet
// keep their controls inside the safe area.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#08090b" };

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const cookieHeader=requestHeaders.get("cookie")||"";
  const locale = localeFrom(cookieHeader, requestHeaders.get("accept-language") || "");
  const { archive, viewer } = await loadSession();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <LocaleProvider initialLocale={locale} currentYear={new Date().getUTCFullYear()}>
          <ArchiveProvider archive={archive} viewer={viewer} zone={zoneFrom(cookieHeader)}>
            <Shell>{children}</Shell>
          </ArchiveProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
