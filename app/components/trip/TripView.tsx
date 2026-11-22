"use client";

import Link from "next/link";
import { useMemo } from "react";
import { buildTrips, companionsOf, findTrip, type Gap } from "../../lib/trips";
import type { Locale } from "../../lib/i18n";
import { cityOf, coordinatesOf, countryName, countryOf, metroOf } from "../../lib/places";
import { pathPoints } from "../../lib/network";
import { formatDayRange, formatDuration, formatLegDate, formatNumber, formatTripRange, ui } from "../../lib/copy";
import { tripTitle, tripVia } from "../../lib/titles";
import { toneColor } from "../../lib/palette";
import CarrierMark from "../CarrierMark";
import { useLocale } from "../LocaleProvider";
import { useArchive, useClock, useLinks } from "../ArchiveProvider";
import { countdownOf, hasLanded } from "../../lib/plan";
import { countdownText, planUi } from "../../lib/copy-plan";
import { useScene, useStage, type Scene } from "../stage/StageContext";
import { Figures, useTitle } from "../common/Lens";
import Owner from "../common/Owner";
import { StayDays } from "../common/Weather";
import CountryMark from "../common/CountryMark";
import { CityHero, ImageryCredit } from "../common/CityImage";
import { addDays } from "../../lib/weather";
import DetailHead from "../common/Pager";
import ShareCard from "../cards/ShareCard";
import common from "../common/common.module.css";
import styles from "./TripView.module.css";

// A trip as an itinerary: each leg's times and ends, and what happened between
// them. The globe draws the legs in travel order and runs the route again.
const nightsLabel: Record<Locale, string> = { "zh-Hans": "晚", "zh-Hant": "晚", en: "nights" };

export default function TripView({ id }: { id: string }) {
  const { locale } = useLocale();
  const text = ui[locale];
  const { setPreview } = useStage();
  const { flights, all, owner } = useArchive();
  const links = useLinks();
  const clock = useClock();
  // A trip is whole with its booked legs; the base map is what was flown.
  const trip = useMemo(() => findTrip(all, id), [all, id]);
  const trips = useMemo(() => buildTrips(all), [all]);
  useTitle(trip ? tripTitle(trip, locale) : text.meta.trip);

  const scene = useMemo<Scene>(() => ({
    flights,
    focus: trip?.flights ?? null,
    directed: true,
    pinned: trip ? [...new Set([trip.destination, ...trip.stays, trip.origin, ...trip.flights.flatMap((flight) => [flight.origin, flight.destination])])] : [],
    camera: trip ? { kind: "fit", points: pathPoints(trip.flights), maxZoom: 6 } : { kind: "world" },
    cameraKey: `trip:${id}`,
  }), [flights, trip, id]);
  useScene(scene);

  if (!trip) {
    return (
      <div className={common.detail}>
        <DetailHead backHref="/" backLabel={text.nav.trips} previous={null} next={null} />
        <h1 className={common.empty}>{text.trip.notFound}</h1>
      </div>
    );
  }

  const index = trips.findIndex((item) => item.id === trip.id);
  const neighbour = (offset: number) => {
    const other = index >= 0 ? trips[index + offset] : undefined;
    return other ? { href: `/trips/${encodeURIComponent(other.id)}`, label: offset > 0 ? text.trip.previous : text.trip.next, title: `${tripTitle(other, locale)} · ${formatDayRange(other.start, other.end, locale)}` } : null;
  };
  const n = (value: number) => formatNumber(value, locale);
  const length = trip.kind === "round" ? text.units.nights(trip.nights) : trip.kind === "move" ? text.trip.moved : text.trip.oneWay;
  const next = trip.flights.find((flight) => !hasLanded(flight, clock.now));
  const status = !next ? null : next === trip.flights[0] ? countdownText(countdownOf(next, clock), next.depart, locale) : planUi[locale].underway;

  return (
    <div className={common.detail}>
      <DetailHead backHref="/" backLabel={text.nav.trips} previous={neighbour(1)} next={neighbour(-1)} actions={<ShareCard quiet request={{ kind: "trip", trip }} />} />
      <CityHero
        code={trip.destination}
        href={`/places/${encodeURIComponent(metroOf(trip.destination))}`}
        eyebrow={[countryName(countryOf(trip.destination), locale), tripVia(trip, locale)].filter(Boolean).join(" · ")}
        mark={<CountryMark iso={countryOf(trip.destination)} city={coordinatesOf(trip.destination)} size={56} color={toneColor(owner.tone)} label={countryName(countryOf(trip.destination), locale)} />}
      >
        <h1 className={common.headline}>{tripTitle(trip, locale)}</h1>
      </CityHero>
      <p className={styles.when}>
        <span>{formatTripRange(trip.start, trip.end, locale)}</span>
        <span>{length}</span>
        {status ? <span style={{ color: toneColor(owner.tone) }}>{status}</span> : null}
        {companionsOf(trip).map(({ id: linkId, count }) => {
          const link = links.get(linkId);
          if (!link) return null;
          const label = count === trip.flights.length ? text.pair.with(link.name) : `${text.pair.with(link.name)} · ${text.pair.tripShare(count, trip.flights.length)}`;
          return <Owner key={linkId} color={toneColor(link.tone)} label={label} href={`/with/${encodeURIComponent(linkId)}`} />;
        })}
      </p>
      <Figures items={[
        ...(trip.kind === "round" && trip.nights > 0 ? [{ value: n(trip.nights), label: nightsLabel[locale] }] : []),
        { value: n(trip.flights.length), label: text.figures.legs },
        { value: n(trip.km), label: text.figures.km },
        { value: formatDuration(trip.minutes, locale), label: text.figures.inAir },
      ]} />

      <ol className={styles.itinerary}>
        {trip.flights.map((flight, legIndex) => {
          const newDay = legIndex === 0 || flight.date !== trip.flights[legIndex - 1].date;
          const gap = trip.gaps[legIndex];
          const offset = flight.arrivalDayOffset ?? 0;
          return (
            <li key={flight.id}>
              {newDay ? <p className={styles.day}>{formatLegDate(flight.date, locale)}</p> : null}
              <Link
                href={`/flights/${encodeURIComponent(flight.id)}`}
                className={styles.leg}
                onMouseEnter={() => setPreview([flight])}
                onMouseLeave={() => setPreview(null)}
                onFocus={() => setPreview([flight])}
                onBlur={() => setPreview(null)}
              >
                <span className={styles.times}>
                  <time>{flight.depart}</time>
                  <time>{flight.arrive}{offset ? <sup>{offset > 0 ? `+${offset}` : offset}</sup> : null}</time>
                </span>
                <span className={styles.rail} aria-hidden="true"><i /><i /></span>
                <span className={styles.ends}>
                  <span><b>{flight.origin}</b>{cityOf(flight.origin, locale)}</span>
                  <span><b>{flight.destination}</b>{cityOf(flight.destination, locale)}</span>
                </span>
                <span className={styles.meta}>
                  <span className={styles.number}><CarrierMark airline={flight.airline} size={16} />{flight.flight}</span>
                  <span>{formatDuration(flight.durationMinutes, locale)}</span>
                </span>
              </Link>
              {gap ? (
                <div className={styles.gap} data-stay={gap.kind === "connection" ? undefined : "true"}>
                  <Link href={`/places/${encodeURIComponent(metroOf(gap.kind === "ground" ? gap.to : gap.at))}`}>{gapLine(gap, locale)}</Link>
                  {gap.kind === "stay" && gap.nights > 0 && trip.flights[legIndex + 1] ? (
                    <StayDays code={gap.at} from={addDays(flight.date, offset)} to={trip.flights[legIndex + 1].date} locale={locale} />
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <ImageryCredit locale={locale} />
    </div>
  );
}

// What happened between two legs, in the reader's words.
function gapLine(gap: Gap, locale: Locale) {
  const text = ui[locale].trip;
  const wait = gap.minutes !== null ? formatDuration(gap.minutes, locale) : "";
  if (gap.kind === "connection") return text.connection(cityOf(gap.at, locale), wait);
  if (gap.kind === "ground") return text.ground(cityOf(gap.to, locale), gap.nights);
  return gap.nights ? text.stay(cityOf(gap.at, locale), gap.nights) : text.visit(cityOf(gap.at, locale), wait);
}
