"use client";

import { useMemo } from "react";
import { countriesIn, citiesIn } from "../../lib/footprint";
import { yearCounts } from "../../lib/insights";
import { coordinatesOf, metroOf } from "../../lib/places";
import { residenceOf } from "../../lib/residence";
import { buildTrips } from "../../lib/trips";
import type { Locale } from "../../lib/i18n";
import { formatNumber } from "../../lib/copy";
import { publicUi } from "../../lib/copy-public";
import { toneColor } from "../../lib/palette";
import { useLocale } from "../LocaleProvider";
import { useArchive, useShared } from "../ArchiveProvider";
import { useScene, useStage, type Scene } from "../stage/StageContext";
import { useYearParam } from "../shell/address";
import { Lens, useTitle } from "../common/Lens";
import { usePin } from "../common/usePin";
import ScopeFigures from "../common/ScopeFigures";
import TripRow from "../common/TripRow";
import { ImageryCredit } from "../common/CityImage";
import { Cities, Countries, Distance } from "../places/Footprint";
import common from "../common/common.module.css";

// Someone's public page, made for the person they sent it to: usually a
// friend opening a chat link on a phone, curious about where this person has
// been, with no account and no reason to learn the site. So it is a portrait,
// not a dashboard: how much they have flown, their trips newest first with
// each destination from above, the distance coiled round the Earth, the
// countries and the cities; then one way to make your own. Nothing opens the
// owner's own pages, and the findings in sentences stay on the owner's side.
// Only round trips are listed: a move or a flight home names where the owner
// lives, and a trip still open says roughly where they are now.
const RECENT = 8;

const t = (locale: Locale, hans: string, hant: string, en: string) => locale === "en" ? en : locale === "zh-Hant" ? hant : hans;

export default function SharedView({ year: serverYear }: { year: number | null }) {
  const { locale, currentYear } = useLocale();
  const { setPreview } = useStage();
  const shared = useShared();
  const [year, setYear] = useYearParam(shared ? `/s/${shared.slug}` : "/", serverYear);
  const { flights: all, owner } = useArchive();
  const tone = toneColor(owner.tone);
  const counts = useMemo(() => yearCounts(all), [all]);
  const list = useMemo(() => year ? all.filter((flight) => flight.year === year) : all, [all, year]);
  const allTrips = useMemo(() => buildTrips(all).filter((trip) => trip.kind === "round"), [all]);
  const trips = useMemo(() => year ? allTrips.filter((trip) => trip.year === year) : allTrips, [allTrips, year]);
  const shown = year ? trips : trips.slice(0, RECENT);
  const countries = useMemo(() => countriesIn(list), [list]);
  const ranked = useMemo(() => [...citiesIn(list).values()].sort((a, b) => b.arrivals - a.arrivals), [list]);
  const homes = useMemo(() => new Set(residenceOf(all).homes.map((home) => metroOf(home.code))), [all]);
  const [pinned, setPinned] = usePin(`${year ?? "all"}`);
  const whose = publicUi[locale].shared.title(owner.name);
  useTitle(year ? `${whose} · ${year}` : whose);

  const pinnedCountry = countries.find((country) => `country:${country.iso}` === pinned) ?? null;
  const scene = useMemo<Scene>(() => ({
    // Drawn in the owner's colour; their routes open nothing here.
    colors: { me: tone },
    readOnly: true,
    flights: all,
    focus: pinnedCountry?.flights ?? (year && list.length ? list : null),
    pinned: pinnedCountry ? pinnedCountry.cities.map((city) => city.code) : ranked.filter((city) => !homes.has(city.metro)).slice(0, 5).map((city) => city.code),
    camera: pinnedCountry
      ? { kind: "fit", points: pinnedCountry.cities.map((city) => coordinatesOf(city.code)), maxZoom: 4.5 }
      : { kind: "world", around: year && list.length ? list : undefined },
    cameraKey: `s:${shared?.slug ?? ""}:${year ?? "all"}:${pinned ?? ""}`,
  }), [all, list, year, tone, pinnedCountry, ranked, homes, pinned, shared?.slug]);
  useScene(scene);

  const n = (value: number) => formatNumber(value, locale);
  return (
    <Lens counts={counts} year={year} onYear={setYear} onPreviewYear={(value) => setPreview(value ? all.filter((flight) => flight.year === value) : null)}>
      {!list.length ? <h1 className={common.empty}>{year ? `${year} · —` : "—"}</h1> : (
        <>
          <ScopeFigures flights={list} locale={locale} year={year} />
          {shown.length ? (
            <section className={common.group} aria-labelledby="shared-trips">
              <header className={common.groupHead}>
                <h2 id="shared-trips">{year ? t(locale, "这一年的旅程", "這一年的旅程", "Trips that year") : t(locale, "最近的旅程", "最近的旅程", "Latest trips")}</h2>
                <span>{t(locale, `共 ${n(trips.length)} 次`, `共 ${n(trips.length)} 次`, trips.length === 1 ? "1 in all" : `${n(trips.length)} in all`)}</span>
              </header>
              <ol className={common.tripList}>
                {shown.map((trip) => <TripRow key={trip.id} trip={trip} locale={locale} onPreview={setPreview} withYear={!year && trip.year !== currentYear} linked={false} />)}
              </ol>
            </section>
          ) : null}
          <Distance flights={list} locale={locale} tone={tone} />
          <Countries countries={countries} locale={locale} tone={tone} pinned={pinned} onPin={setPinned} onPreview={setPreview} />
          <Cities trips={trips} homes={homes} flights={list} locale={locale} onPreview={setPreview} linked={false} />
          <ImageryCredit locale={locale} />
        </>
      )}
    </Lens>
  );
}
