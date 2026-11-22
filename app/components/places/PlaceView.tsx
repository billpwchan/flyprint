"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { citiesIn, connectionsOf } from "../../lib/footprint";
import { airportName, type Locale } from "../../lib/i18n";
import { cityOf, coordinatesOf, countryName, metroOf } from "../../lib/places";
import { pathPoints } from "../../lib/network";
import { buildTrips, isAway } from "../../lib/trips";
import { formatDate, formatNumber, ui } from "../../lib/copy";
import { useLocale } from "../LocaleProvider";
import { useArchive, useClock } from "../ArchiveProvider";
import { countdownOf, hasLanded } from "../../lib/plan";
import { countdownText, planUi } from "../../lib/copy-plan";
import { useScene, useStage, type Scene } from "../stage/StageContext";
import DetailHead from "../common/Pager";
import TripRow from "../common/TripRow";
import { Figures, useTitle } from "../common/Lens";
import CountryMark from "../common/CountryMark";
import { CityHero, ImageryCredit } from "../common/CityImage";
import { residenceOf, type Home } from "../../lib/residence";
import { toneColor } from "../../lib/palette";
import common from "../common/common.module.css";
import own from "./PlaceView.module.css";
import AirportDiagram, { extentOf } from "./AirportDiagram";
import type { AirportRunways } from "../../lib/runways";

const SHOWN = 6;

export default function PlaceView({ metro, runways }: { metro: string; runways: Record<string, AirportRunways> }) {
  const { locale } = useLocale();
  const text = ui[locale];
  const { setPreview } = useStage();
  const { flights, ahead, all, owner } = useArchive();
  const clock = useClock();
  const city = useMemo(() => citiesIn(flights).get(metro) ?? null, [flights, metro]);
  // A city only booked so far still has a page: when the first visit is, and its airports.
  const booked = useMemo(() => citiesIn(ahead).get(metro) ?? null, [ahead, metro]);
  const nextArrival = booked?.flights.find((flight) => metroOf(flight.destination) === metro) ?? null;
  const place = city ?? booked;
  const connections = useMemo(() => connectionsOf(flights, metro), [flights, metro]);
  const trips = useMemo(() => buildTrips(all)
    .filter((trip) => isAway(trip) && [trip.destination, ...trip.stays].some((code) => metroOf(code) === metro)), [all, metro]);
  const [expanded, setExpanded] = useState(false);
  // Nights spent here away from home, and the spans this was home.
  const nights = useMemo(() => trips.reduce((sum, trip) => sum + trip.gaps.filter((gap) => gap.kind === "stay" && metroOf(gap.at) === metro).reduce((total, gap) => total + gap.nights, 0), 0), [trips, metro]);
  const lived = useMemo(() => residenceOf(flights).homes.filter((home) => metroOf(home.code) === metro), [flights, metro]);

  const scene = useMemo<Scene>(() => ({
    flights,
    focus: place?.flights ?? null,
    pinned: place ? [place.code, ...connections.slice(0, 6).map((entry) => entry.code)] : [],
    camera: place ? { kind: "fit", points: pathPoints(place.flights), maxZoom: 5, anchor: coordinatesOf(place.code) } : { kind: "world" },
    cameraKey: `place:${metro}`,
  }), [flights, place, connections, metro]);
  useScene(scene);
  useTitle(place ? cityOf(place.code, locale) : text.nav.places);

  if (!place) {
    return (
      <div className={common.detail}>
        <DetailHead backHref="/places" backLabel={text.nav.places} previous={null} next={null} />
        <h1 className={common.empty}>{text.place.notFound}</h1>
      </div>
    );
  }

  const name = cityOf(place.code, locale);
  const n = (value: number) => formatNumber(value, locale);
  const airportList = [...place.airports.entries()].sort((a, b) => b[1] - a[1]);
  const lead = city
    ? (city.arrivals > 1 ? text.place.lead(formatDate(city.first, locale), formatDate(city.last, locale), n(city.arrivals)) : text.place.once(formatDate(city.first, locale)))
    : nextArrival ? planUi[locale].firstVisit(formatDate(nextArrival.date, locale)) : "";
  const nextLine = city && nextArrival ? planUi[locale].nextVisit(formatDate(nextArrival.date, locale)) : "";
  const surveyed = airportList.map(([code]) => code).filter((code) => runways[code]?.runways.length);
  // One scale for every airport of the city, wide enough for the largest either way.
  // Never closer than 1.5 km of ground, so a single short strip still reads as one.
  const span = Math.max(1500, ...surveyed.map((code) => { const extent = extentOf(runways[code].runways); return Math.max(extent.width, extent.height / 0.62); })) * 1.22;
  const max = connections[0]?.count ?? 1;
  const shown = expanded ? connections : connections.slice(0, SHOWN);
  return (
    <div className={common.detail}>
      <DetailHead backHref="/places" backLabel={text.nav.places} previous={null} next={null} />
      <section aria-labelledby="place-title">
        <CityHero code={place.code} eyebrow={countryName(place.country, locale)} mark={<CountryMark iso={place.country} city={coordinatesOf(place.code)} size={56} color={toneColor(owner.tone)} />}>
          <h1 id="place-title" className={common.headline}>{name}</h1>
        </CityHero>
        <p className={own.where}>
          {airportList.map(([code]) => <span key={code}>{airportLabel(code, locale)} <b>{code}</b></span>)}
        </p>
        {city ? (
          <Figures items={[
            { value: n(city.flights.length), label: placeWords[locale].flights },
            { value: n(trips.filter((trip) => trip.flights.some((flight) => !ahead.includes(flight))).length), label: placeWords[locale].visits },
            ...(nights ? [{ value: n(nights), label: placeWords[locale].nights }] : []),
            { value: city.first.slice(0, 4), label: placeWords[locale].first },
          ]} />
        ) : null}
        {lived.length ? <p className={own.lived}>{livedLine(lived, locale)}</p> : null}
        <p className={common.lead}>{lead}{nextLine ? `${locale === "en" ? " " : ""}${nextLine}` : ""}</p>
      </section>

      {surveyed.length ? (
        <section className={common.section} aria-labelledby="airports-title">
          <h2 id="airports-title" className={common.sectionTitle}>{text.place.airports}</h2>
          {surveyed.map((code) => {
            const { runways: list, unsurveyed } = runways[code];
            const longest = Math.max(...list.map((runway) => runway[7]), ...unsurveyed);
            return (
              <figure key={code} className={own.airport}>
                <AirportDiagram runways={list} span={span} label={airportName(code, locale, code)} />
                <figcaption>
                  <b>{code}</b><span>{airportLabel(code, locale)}</span><span>{text.place.runways(n(list.length + unsurveyed.length), n(longest))}</span>
                  {unsurveyed.length ? <span>{text.place.unsurveyed(n(unsurveyed.length))}</span> : null}
                </figcaption>
              </figure>
            );
          })}
        </section>
      ) : null}

      {connections.length ? (
        <section className={common.section} aria-labelledby="connections-title">
          <h2 id="connections-title" className={common.sectionTitle}>{text.place.connections}</h2>
          <ol className={own.connections}>
            {shown.map((entry) => {
              const other = cityOf(entry.code, locale);
              return (
                <li key={entry.metro}>
                  <Link
                    href={`/log?q=${encodeURIComponent(`${name} ${other}`)}`}
                    onMouseEnter={() => setPreview(entry.flights)}
                    onMouseLeave={() => setPreview(null)}
                    onFocus={() => setPreview(entry.flights)}
                    onBlur={() => setPreview(null)}
                  >
                    <span className={own.connectionName}>{other}</span>
                    <span className={own.track}><i style={{ width: `${(entry.count / max) * 100}%` }} /></span>
                    <span className={own.connectionCount}>{n(entry.count)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
          {connections.length > SHOWN && !expanded ? (
            <button type="button" className={own.more} onClick={() => setExpanded(true)}>{text.place.showAll(n(connections.length))}</button>
          ) : null}
        </section>
      ) : null}

      {trips.length ? (
        <section className={common.section} aria-labelledby="place-trips">
          <h2 id="place-trips" className={common.sectionTitle}>{city ? text.place.trips : planUi[locale].tripsHere}</h2>
          <ol className={common.tripList}>
            {trips.map((trip) => {
              const next = trip.flights.find((flight) => !hasLanded(flight, clock.now));
              const when = !next ? undefined : next === trip.flights[0] ? countdownText(countdownOf(next, clock), next.depart, locale, true) : planUi[locale].underway;
              return <TripRow key={trip.id} trip={trip} locale={locale} onPreview={setPreview} withYear when={when} />;
            })}
          </ol>
        </section>
      ) : null}
      <ImageryCredit locale={locale} />
    </div>
  );
}

const placeWords: Record<Locale, { flights: string; visits: string; nights: string; first: string }> = {
  "zh-Hans": { flights: "班", visits: "次到访", nights: "晚", first: "第一次" },
  "zh-Hant": { flights: "班", visits: "次到訪", nights: "晚", first: "第一次" },
  en: { flights: "flights", visits: "visits", nights: "nights", first: "first" },
};

// "2019 年起住在这里", or the spans it was home: "2016–2019 住在这里".
function livedLine(homes: Home[], locale: Locale) {
  const spans = homes.map((home) => {
    const from = home.from.slice(0, 4), to = home.to?.slice(0, 4);
    if (!to) return locale === "en" ? `since ${from}` : `${from} 年起`;
    return from === to ? from : `${from}–${to}`;
  });
  const joined = spans.join(locale === "en" ? ", " : "、");
  if (locale === "en") return `Home ${joined}`;
  const here = locale === "zh-Hant" ? "住在這裡" : "住在这里";
  return homes.length === 1 && !homes[0].to ? `${joined}${here}` : `${joined} ${here}`;
}

// "Pudong", not "Shanghai Pudong International", beside a heading that already says Shanghai.
function airportLabel(code: string, locale: Locale) {
  const full = airportName(code, locale, code);
  const city = cityOf(code, locale);
  const short = full.replace(city, "").replace(/\b(International|Airport)\b/g, "").replace(/国际|國際|机场|機場/g, "").replace(/^[\s–—-]+|[\s–—-]+$/g, "").trim();
  return short || full;
}
