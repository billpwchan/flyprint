"use client";

import Link from "next/link";
import { useState } from "react";
import type { Flight } from "../../lib/data";
import type { Locale } from "../../lib/i18n";
import { carrierName } from "../../lib/i18n";
import { cityOf, metroOf } from "../../lib/places";
import { formatNumber, ui } from "../../lib/copy";
import { fleetUi } from "../../lib/copy-fleet";
import { carriersIn, makerName, routesIn, tailsIn, type TypeEntry } from "../../lib/fleet";
import AircraftProfile from "../aircraft/AircraftProfile";
import AirframePhoto from "../aircraft/AirframePhoto";
import CarrierMark from "../CarrierMark";
import common from "../common/common.module.css";
import styles from "./Fleet.module.css";

type Preview = (flights: Flight[] | null) => void;
const hover = (flights: Flight[], onPreview: Preview) => ({
  onMouseEnter: () => onPreview(flights),
  onMouseLeave: () => onPreview(null),
  onFocus: () => onPreview(flights),
  onBlur: () => onPreview(null),
});
const inferred = (flights: Flight[]) => flights.every((flight) => flight.aircraft?.source === "typical");

// Types drawn to one scale, the longest across the full row, noses aligned.
export function TypeLineup({ types, locale, onPreview, titled = true }: { types: TypeEntry[]; locale: Locale; onPreview: Preview; titled?: boolean }) {
  const text = fleetUi[locale];
  const span = Math.max(...types.map((entry) => entry.type?.variant.length ?? 0));
  return (
    <section className={common.section} aria-labelledby={titled ? "types-title" : undefined} aria-label={titled ? undefined : text.types}>
      {titled ? (
        <header className={styles.sectionHead}>
          <h2 id="types-title" className={common.sectionTitle}>{text.types}</h2>
          <span>{text.scale}</span>
        </header>
      ) : null}
      <ol className={styles.lineup}>
        {types.map((entry) => (
          <li key={entry.icao}>
            <Link href={`/fleet/${encodeURIComponent(entry.icao)}`} className={styles.type} {...hover(entry.flights, onPreview)}>
              {entry.type ? <AircraftProfile icao={entry.icao} span={span} tentative={inferred(entry.flights)} /> : null}
              <span className={styles.typeLine}>
                {entry.type ? <small>{makerName(entry.type.maker, locale)}</small> : null}
                <strong>{entry.type ? entry.type.name : entry.model}</strong>
                <span>{ui[locale].units.flights(formatNumber(entry.flights.length, locale))}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CarrierList({ flights, locale, onPreview, title, titled = true }: { flights: Flight[]; locale: Locale; onPreview: Preview; title: string; titled?: boolean }) {
  const carriers = carriersIn(flights);
  const max = carriers[0]?.flights.length ?? 1;
  return (
    <section className={common.section} aria-labelledby={titled ? "carriers-title" : undefined} aria-label={titled ? undefined : title}>
      {titled ? <h2 id="carriers-title" className={common.sectionTitle}>{title}</h2> : null}
      <ol className={styles.bars}>
        {carriers.map((entry) => (
          <li key={entry.code}>
            <Link href={`/airlines/${encodeURIComponent(entry.code)}`} className={styles.carrier} {...hover(entry.flights, onPreview)}>
              <CarrierMark airline={entry.code} size={24} />
              <span className={styles.name}>{carrierName(entry.code, locale)}</span>
              <span className={styles.track}><i style={{ width: `${(entry.flights.length / max) * 100}%` }} /></span>
              <span className={styles.count}>{formatNumber(entry.flights.length, locale)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

const ROUTES = 6;

// `scope` narrows each route's link to the flights counted here, e.g. "type:A333".
export function RouteBars({ flights, scope, locale, onPreview }: { flights: Flight[]; scope: string; locale: Locale; onPreview: Preview }) {
  const text = fleetUi[locale];
  const routes = routesIn(flights).slice(0, ROUTES);
  const max = routes[0]?.flights.length ?? 1;
  return (
    <section className={common.section} aria-labelledby="routes-title">
      <h2 id="routes-title" className={common.sectionTitle}>{text.routes}</h2>
      <ol className={styles.bars}>
        {routes.map((route) => {
          const a = cityOf(route.a, locale), b = cityOf(route.b, locale);
          return (
            <li key={`${route.a}-${route.b}`}>
              <Link href={`/log?q=${encodeURIComponent(`${scope} route:${metroOf(route.a)}/${metroOf(route.b)}`)}`} className={styles.route} {...hover(route.flights, onPreview)}>
                <span className={styles.name}>{a} – {b}</span>
                <span className={styles.track}><i style={{ width: `${(route.flights.length / max) * 100}%` }} /></span>
                <span className={styles.count}>{formatNumber(route.flights.length, locale)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const TAILS = 6;

// The airframes themselves, as photographs where Planespotters has one.
export function TailGrid({ flights, locale, onPreview }: { flights: Flight[]; locale: Locale; onPreview: Preview }) {
  const text = fleetUi[locale];
  const tails = tailsIn(flights);
  const [expanded, setExpanded] = useState(false);
  if (!tails.length) return null;
  const shown = expanded ? tails : tails.slice(0, TAILS);
  return (
    <section className={common.section} aria-labelledby="tails-title">
      <h2 id="tails-title" className={common.sectionTitle}>{text.tails}</h2>
      <ol className={styles.tails}>
        {shown.map((tail) => (
          <li key={tail.registration} {...hover(tail.flights, onPreview)}>
            <AirframePhoto registration={tail.registration} credit={text.credit} />
            <Link href={`/log?q=${encodeURIComponent(tail.registration)}`} className={styles.tailLine}>
              <strong>{tail.registration}</strong>
              <span>{text.tailCount(formatNumber(tail.flights.length, locale))}</span>
            </Link>
          </li>
        ))}
      </ol>
      {tails.length > TAILS && !expanded ? <button type="button" className={styles.more} onClick={() => setExpanded(true)}>{text.moreTails(formatNumber(tails.length, locale))}</button> : null}
    </section>
  );
}

export function AllFlights({ query, count, locale }: { query: string; count: number; locale: Locale }) {
  return <Link href={`/log?q=${encodeURIComponent(query)}`} className={styles.all}>{fleetUi[locale].all(formatNumber(count, locale))}</Link>;
}
