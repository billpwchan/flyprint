"use client";

import { useMemo } from "react";
import type { Flight } from "../../lib/data";
import { citiesIn, countriesIn, newCitiesByYear, type City } from "../../lib/footprint";
import { buildInsights, yearCounts } from "../../lib/insights";
import { angularDistance } from "../../lib/geo";
import { cityOf, coordinatesOf, metroOf } from "../../lib/places";
import { mainHome, near, residenceOf, wasHome } from "../../lib/residence";
import { buildTrips } from "../../lib/trips";
import { yearReport } from "../../lib/years";
import { carriersIn, typesIn } from "../../lib/fleet";
import { pathPoints } from "../../lib/network";
import { formatNumber, ui } from "../../lib/copy";
import { fleetUi } from "../../lib/copy-fleet";
import type { Locale } from "../../lib/i18n";
import { useLocale } from "../LocaleProvider";
import { useArchive } from "../ArchiveProvider";
import { useScene, useStage, type Scene } from "../stage/StageContext";
import { useYearParam } from "../shell/address";
import { Lens, useTitle } from "../common/Lens";
import Readings, { type Reading } from "../common/Readings";
import { usePin } from "../common/usePin";
import ScopeFigures from "../common/ScopeFigures";
import { ImageryCredit } from "../common/CityImage";
import ShareCard from "../cards/ShareCard";
import { archiveReadings, yearReadings } from "./readings";
import { CarrierList, TypeLineup } from "../fleet/parts";
import { Aloft, Cities, Countries, Distance } from "./Footprint";
import { toneColor } from "../../lib/palette";
import common from "../common/common.module.css";
import styles from "./Footprint.module.css";

const EARTH_RADIUS_KM = 6371;

// The third of the three parts, the footprint, as the app draws it: how many
// flights and how far, the distance coiled round the Earth, every hour aloft,
// the findings (each lights its flights on the globe), the aircraft at true
// scale, the airlines, the countries as outlines and the cities from above.
export default function PlacesView({ year: serverYear }: { year: number | null }) {
  const { locale, currentYear } = useLocale();
  const text = ui[locale];
  const fleet = fleetUi[locale];
  const { setPreview } = useStage();
  const [year, setYear] = useYearParam("/places", serverYear);
  const { flights: scoped, owner } = useArchive();
  const tone = toneColor(owner.tone);
  const counts = useMemo(() => yearCounts(scoped), [scoped]);
  const list = useMemo(() => year ? scoped.filter((flight) => flight.year === year) : scoped, [scoped, year]);
  const countries = useMemo(() => countriesIn(list), [list]);
  const cities = useMemo(() => citiesIn(list), [list]);
  const allTrips = useMemo(() => buildTrips(scoped), [scoped]);
  const trips = useMemo(() => year ? allTrips.filter((trip) => trip.year === year) : allTrips, [allTrips, year]);
  const homes = useMemo(() => new Set(residenceOf(scoped).homes.map((home) => metroOf(home.code))), [scoped]);
  const types = useMemo(() => typesIn(list), [list]);
  const carriers = useMemo(() => carriersIn(list).length, [list]);
  const insights = useMemo(() => buildInsights(scoped), [scoped]);
  const readings = useMemo(() => {
    if (year) {
      const report = yearReport(scoped, year, allTrips);
      return report.flights.length ? yearReadings(report, locale, counts[0]?.year === year) : [];
    }
    return [...archiveReadings(insights, scoped, locale, currentYear).filter((reading) => reading.key !== "type"), ...composeReadings(list, cities, locale)];
  }, [year, scoped, allTrips, locale, counts, insights, currentYear, list, cities]);
  const [pinned, setPinned] = usePin(`${year ?? "all"}`);
  useTitle(year ? `${text.nav.places} · ${year}` : text.nav.places);

  const pinnedCountry = countries.find((country) => `country:${country.iso}` === pinned) ?? null;
  const pinnedReading = readings.find((reading) => reading.key === pinned) ?? null;
  const ranked = useMemo(() => [...cities.values()].sort((a, b) => b.arrivals - a.arrivals), [cities]);
  const scene = useMemo<Scene>(() => {
    const focus = pinnedCountry?.flights ?? pinnedReading?.flights ?? (year && list.length ? list : null);
    return {
      flights: scoped,
      focus,
      pinned: pinnedCountry ? pinnedCountry.cities.map((city) => city.code) : ranked.slice(0, 6).map((city) => city.code),
      camera: pinnedCountry
        ? { kind: "fit", points: pinnedCountry.cities.map((city) => coordinatesOf(city.code)), maxZoom: 4.5 }
        : pinnedReading && pinnedReading.frame !== false ? { kind: "fit", points: pathPoints(pinnedReading.flights), maxZoom: 5 } : { kind: "world", around: year && list.length ? list : undefined },
      cameraKey: `places:${year ?? "all"}:${pinned ?? ""}`,
    };
  }, [scoped, list, year, pinnedCountry, pinnedReading, ranked, pinned]);
  useScene(scene);

  const n = (value: number) => formatNumber(value, locale);
  return (
    <Lens counts={counts} year={year} onYear={setYear} onPreviewYear={(value) => setPreview(value ? scoped.filter((flight) => flight.year === value) : null)}>
      {!list.length ? <h1 className={common.empty}>{year ? text.years.empty(year) : "—"}</h1> : (
        <>
          <ScopeFigures flights={list} locale={locale} year={year} action={<ShareCard request={{ kind: "year", year }} />} />
          <Distance flights={list} locale={locale} tone={tone} />
          <Aloft flights={list} locale={locale} />
          {readings.length ? <div className={styles.findings}><Readings readings={readings} pinned={pinned} onPin={setPinned} onPreview={setPreview} label={text.readings.title} /></div> : null}
          {types.length ? (
            <section className={styles.part}>
              <header className={styles.partHead}>
                <h2><b>{n(types.length)}</b><span>{fleet.types}</span></h2>
                <p>{fleet.scale}</p>
              </header>
              <TypeLineup types={types} locale={locale} onPreview={setPreview} titled={false} />
            </section>
          ) : null}
          <section className={styles.part}>
            <header className={styles.partHead}>
              <h2><b>{n(carriers)}</b><span>{fleet.carriers}</span></h2>
            </header>
            <CarrierList flights={list} locale={locale} onPreview={setPreview} title={fleet.carriers} titled={false} />
          </section>
          <Countries countries={countries} locale={locale} tone={tone} pinned={pinned} onPin={setPinned} onPreview={setPreview} />
          <Cities trips={trips} homes={homes} flights={list} locale={locale} onPreview={setPreview} />
          <ImageryCredit locale={locale} />
        </>
      )}
    </Lens>
  );
}

function composeReadings(list: Flight[], cities: Map<string, City>, locale: Locale): Reading[] {
  const text = ui[locale];
  const n = (value: number) => formatNumber(value, locale);
  const city = (code: string) => cityOf(code, locale);
  const readings: Reading[] = [];
  const all = [...cities.values()];
  // Where they lived longest is the yardstick; nowhere they lived is a destination.
  const home = mainHome(list);
  const touching = (metros: Set<string>) => list.filter((flight) => metros.has(metroOf(flight.origin)) || metros.has(metroOf(flight.destination)));

  // Where they have lived, in the order they first moved there, drawn as the flights that moved them.
  const lived: { code: string; year: string }[] = [];
  for (const entry of residenceOf(list).homes) if (!lived.some((seen) => near(seen.code, entry.code))) lived.push({ code: entry.code, year: entry.from.slice(0, 4) });
  if (lived.length > 1) {
    readings.push({
      key: "homes",
      title: text.places.homes(n(lived.length)),
      detail: text.readings.list(lived.map((entry) => text.places.homeSince(city(entry.code), entry.year))),
      flights: buildTrips(list).filter((trip) => trip.kind === "move").flatMap((trip) => trip.flights),
    });
  }

  const growth = newCitiesByYear(list);
  if (growth.length > 2) {
    const peak = growth.reduce((best, entry) => entry.cities.length > best.cities.length ? entry : best, growth[0]);
    const metros = new Set(peak.cities.map((entry) => entry.metro));
    readings.push({
      key: "growth",
      title: text.places.growth(peak.year, n(peak.cities.length)),
      detail: peak.cities.length > 8 ? text.readings.listMore(peak.cities.slice(0, 8).map((entry) => city(entry.code))) : text.readings.list(peak.cities.map((entry) => city(entry.code))),
      flights: touching(metros).filter((flight) => flight.year === peak.year),
    });
  }

  const away = all.filter((entry) => !wasHome(list, entry.code)).sort((a, b) => b.arrivals - a.arrivals);
  if (away[0] && away[0].arrivals > 1) {
    const rest = away.slice(1, 4).filter((entry) => entry.arrivals > 1).map((entry) => text.years.airlineJoin(city(entry.code), n(entry.arrivals)));
    readings.push({
      key: "most",
      title: text.places.most(city(away[0].code), n(away[0].arrivals)),
      detail: rest.length ? text.places.mostRest(text.readings.list(rest)) : "",
      flights: touching(new Set([away[0].metro])),
    });
  }

  if (home && away.length) {
    const origin = coordinatesOf(home);
    const far = away.reduce((best, entry) => angularDistance(origin, coordinatesOf(entry.code)) > angularDistance(origin, coordinatesOf(best.code)) ? entry : best, away[0]);
    readings.push({
      key: "far",
      title: text.places.farthest(city(far.code)),
      detail: text.places.farthestDetail(city(home), n(Math.round(angularDistance(origin, coordinatesOf(far.code)) * EARTH_RADIUS_KM / 10) * 10)),
      flights: touching(new Set([far.metro])),
    });
  }
  return readings;
}
