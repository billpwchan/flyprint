"use client";

import Link from "next/link";
import type { Flight } from "../../lib/data";
import { formatDayRange, ui } from "../../lib/copy";
import type { Locale } from "../../lib/i18n";
import { coordinatesOf, countryOf } from "../../lib/places";
import { tripTitle, tripVia } from "../../lib/titles";
import { companionsOf, type Trip } from "../../lib/trips";
import { toneColor } from "../../lib/palette";
import Owner from "./Owner";
import CountryMark from "./CountryMark";
import CityImage from "./CityImage";
import { useArchive, useLinks } from "../ArchiveProvider";
import styles from "./common.module.css";

// A trip in a list, the way the app lists it: the destination from above,
// its name and dates, and a line of what it was. note: what to say in place
// of who came along, on a page already about them. when: how soon a trip
// still ahead begins, in place of the year. linked: whether the row opens the
// trip's page, which only the owner has.
export default function TripRow({ trip, locale, onPreview, withYear = false, note, when, linked = true }: { trip: Trip; locale: Locale; onPreview: (flights: Flight[] | null) => void; withYear?: boolean; note?: string; when?: string; linked?: boolean }) {
  const text = ui[locale];
  const links = useLinks();
  const { owner } = useArchive();
  const companion = companionsOf(trip).map(({ id }) => links.get(id)).find(Boolean);
  const length = trip.kind === "round" ? text.units.nights(trip.nights) : trip.kind === "move" ? text.units.moved : text.units.oneWay;
  const facts = [length, text.units.legs(trip.flights.length), tripVia(trip, locale)].filter(Boolean).join(" · ");
  const iso = countryOf(trip.destination);
  const inside = (
    <>
        <CityImage code={trip.destination} className={styles.tripImage} fallback={<CountryMark iso={iso} city={coordinatesOf(trip.destination)} size={30} color={toneColor(owner.tone)} />} />
        <span className={styles.tripMain}>
          <span className={styles.tripLine}>
            <strong data-quiet={trip.kind === "return" ? "true" : undefined}>{tripTitle(trip, locale)}</strong>
            <span className={styles.tripDate}>
              {formatDayRange(trip.start, trip.end, locale)}{withYear && !when ? ` ${trip.year}` : ""}
            </span>
          </span>
          <span className={styles.tripLine}>
            <span className={styles.tripFacts}>{facts}</span>
            {when ? <small className={styles.tripSoon} style={{ "--tone": toneColor(owner.tone) } as React.CSSProperties}>{when}</small>
              : note !== undefined ? <small className={styles.tripNote}>{note}</small>
              : companion ? <Owner color={toneColor(companion.tone)} label={companion.name} /> : null}
          </span>
        </span>
    </>
  );
  const hover = { onMouseEnter: () => onPreview(trip.flights), onMouseLeave: () => onPreview(null) };
  return (
    <li>
      {linked ? (
        <Link href={`/trips/${encodeURIComponent(trip.id)}`} className={styles.trip} {...hover} onFocus={() => onPreview(trip.flights)} onBlur={() => onPreview(null)}>
          {inside}
        </Link>
      ) : <div className={styles.trip} data-still="" {...hover}>{inside}</div>}
    </li>
  );
}
