"use client";

import Link from "next/link";
import type { Flight, Link as Linked } from "../../lib/data";
import { carrierName, type Locale } from "../../lib/i18n";
import { cityOf } from "../../lib/places";
import { formatLegDate } from "../../lib/copy";
import { countdownOf, daysBetween, type Together } from "../../lib/plan";
import { countdownHeadline, planUi } from "../../lib/copy-plan";
import CarrierMark from "../CarrierMark";
import { LegBoard } from "../common/LegBoard";
import { useClock } from "../ArchiveProvider";
import styles from "./Plan.module.css";

type Colors = { me: string; both: string; them: string };

// The next time the two are together, at the top of their page: a flight both
// booked, drawn like the next flight; or the day both land in one city, with
// how each gets there.
export default function TogetherNext({ together, other, colors, locale, onPreview }: { together: Together; other: Linked; colors: Colors; locale: Locale; onPreview: (flights: Flight[] | null) => void }) {
  const clock = useClock();
  const text = planUi[locale];
  if (together.kind === "flight") {
    const { flight } = together;
    const countdown = countdownOf(flight, clock);
    return (
      <section className={styles.next} aria-label={text.togetherNext} style={{ "--tone": colors.both } as React.CSSProperties}>
        <Link
          href={`/flights/${encodeURIComponent(flight.id)}`}
          className={styles.ticket}
          onMouseEnter={() => onPreview([flight])}
          onMouseLeave={() => onPreview(null)}
          onFocus={() => onPreview([flight])}
          onBlur={() => onPreview(null)}
        >
          <span className={styles.eyebrow}>
            <span>{countdown.kind === "airborne" ? text.airborne : text.togetherNext}</span>
            <span>{formatLegDate(flight.date, locale)}</span>
          </span>
          <strong className={styles.countdown} data-live={countdown.kind === "airborne" || countdown.kind === "today" ? "true" : undefined}>
            {countdownHeadline(countdown, flight.depart, locale)}
          </strong>
          <span className={styles.carrier}>
            <CarrierMark airline={flight.airline} size={18} />
            <b>{flight.flight}</b>
            <span>{carrierName(flight.airline, locale)}</span>
          </span>
          <LegBoard flight={flight} locale={locale} progress={countdown.kind === "airborne" ? countdown.progress : undefined} />
        </Link>
      </section>
    );
  }

  const { mine, theirs, metro, date } = together;
  // Counted down by the calendar to the day the second of them lands.
  const days = daysBetween(clock.today, date);
  const when = days >= 2 ? text.daysShort(days) : days === 1 ? text.tomorrowShort : text.todayShort;
  const headline = text.meet(when, cityOf(metro, locale));
  const both = [mine, theirs];
  const legs: [string, string, Flight, boolean][] = [[text.you, colors.me, mine, true], [other.name, colors.them, theirs, false]];
  return (
    <section
      className={styles.next}
      aria-label={text.meetNext}
      style={{ "--tone": colors.both } as React.CSSProperties}
      onMouseEnter={() => onPreview(both)}
      onMouseLeave={() => onPreview(null)}
    >
      <div className={styles.meet}>
        <span className={styles.eyebrow}>
          <span>{text.meetNext}</span>
          <span>{formatLegDate(date, locale)}</span>
        </span>
        <strong className={styles.countdown} data-live={days <= 0 ? "true" : undefined}>{headline}</strong>
        <ul className={styles.legs}>
          {legs.map(([name, color, flight, own]) => {
            const row = (
              <>
                <i style={{ background: color }} aria-hidden="true" />
                <span className={styles.who}>{name}</span>
                <span className={styles.leg}>
                  <CarrierMark airline={flight.airline} size={14} />
                  <b>{flight.flight}</b>
                  <span>{cityOf(flight.origin, locale)} → {cityOf(flight.destination, locale)}</span>
                </span>
                <span className={styles.lands}>{text.lands(flight.arrive)}</span>
              </>
            );
            return (
              <li key={flight.id}>
                {own ? <Link href={`/flights/${encodeURIComponent(flight.id)}`} className={styles.legRow} onFocus={() => onPreview(both)} onBlur={() => onPreview(null)}>{row}</Link> : <span className={styles.legRow}>{row}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
