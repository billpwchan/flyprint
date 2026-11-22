import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ArchiveProvider from "../../components/ArchiveProvider";
import SharedView from "../../components/shared/SharedView";
import { publicUi } from "../../lib/copy-public";
import { formatNumber } from "../../lib/copy";
import { requestLocale, siteOrigin, titled } from "../../lib/request";
import { brandName } from "../../lib/i18n";
import { parseYear } from "../../lib/scope";
import { loadSession, loadShared } from "../../lib/server/archive";
import { shareVersion } from "../../lib/server/shareImage";
import { zoneFrom } from "../../lib/request";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ year?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).slug;
  const archive = await loadShared(slug);
  const locale = await requestLocale();
  const words = publicUi[locale].shared;
  if (!archive) return { title: await titled(words.missing), robots: { index: false } };
  const n = (value: number) => formatNumber(value, locale);
  const km = archive.flights.reduce((sum, flight) => sum + flight.km, 0);
  const countries = new Set(archive.flights.flatMap((flight) => [archive.places[flight.origin]?.country, archive.places[flight.destination]?.country]).filter(Boolean));
  const title = words.title(archive.owner.name);
  const description = words.description(n(archive.flights.length), n(km), n(countries.size));
  const url = `${await siteOrigin()}/s/${slug}`;
  // The version in the address makes unfurlers fetch a new picture once the routes change.
  const image = { url: `${url.replace("/s/", "/api/share/")}/image?v=${shareVersion(archive)}`, width: 1200, height: 630, alt: title };
  return {
    title: await titled(title),
    description,
    robots: { index: false },
    alternates: { canonical: url },
    openGraph: { type: "profile", siteName: brandName[locale], url, title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function SharedPage({ params, searchParams }: Props) {
  const slug = (await params).slug;
  const archive = await loadShared(slug);
  if (!archive) notFound();
  const { viewer, user } = await loadSession();
  const zone = zoneFrom((await headers()).get("cookie") || "");
  return (
    <ArchiveProvider archive={archive} viewer={viewer} zone={zone} shared={{ slug, mine: user?.id === archive.owner.id }}>
      <SharedView year={parseYear((await searchParams).year)} />
    </ArchiveProvider>
  );
}
