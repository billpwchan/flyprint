"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import type { Flight } from "../../lib/data";
import { carrierName, type Locale } from "../../lib/i18n";
import { cityOf, coordinatesOf, countryName } from "../../lib/places";
import { skyAlong } from "../../lib/daylight";
import { formatLegDate, formatNumber, ui } from "../../lib/copy";
import { countdownOf, firstsOf, isAirborne, type First } from "../../lib/plan";
import { countdownHeadline, planUi } from "../../lib/copy-plan";
import { toneColor } from "../../lib/palette";
import CarrierMark from "../CarrierMark";
import { LegBoard } from "../common/LegBoard";
import Owner from "../common/Owner";
import { useArchive, useClock, useLinks } from "../ArchiveProvider";
import { useStage } from "../stage/StageContext";
import { useLivery } from "../common/livery";
import styles from "./Plan.module.css";

const sooner = (a: Flight, b: Flight) => `${a.date} ${a.depart}` < `${b.date} ${b.depart}`;

// The flight that comes next, or the one in the air: when, where, and what it
// will be the first of. It leaves the page by itself once the last one lands.
export default function NextFlight({ locale }: { locale: Locale }) {
  const { ahead, all, owner } = useArchive();
  const clock = useClock();
  const links = useLinks();
  const { setPreview } = useStage();
  const flight = ahead.find((item) => isAirborne(item, clock.now)) ?? ahead[0];
  const livery = useLivery(flight?.airline);
  const firsts = useMemo(() => flight ? firstsOf(flight, all.filter((other) => other.id !== flight.id && sooner(other, flight))) : [], [flight, all]);
  const sky = useMemo(() => flight?.departAt && flight.durationMinutes > 0
    ? skyAlong(coordinatesOf(flight.origin), coordinatesOf(flight.destination), flight.departAt, flight.durationMinutes)
    : null, [flight]);
  if (!flight) return null;
  const text = planUi[locale];
  const countdown = countdownOf(flight, clock);
  const companions = (flight.with ?? []).map((id) => links.get(id)).filter((link) => !!link);
  const rest = ahead.length - 1;
  return (
    <section className={styles.next} aria-label={text.next} style={{ "--tone": toneColor(owner.tone), "--livery": livery ?? toneColor(owner.tone) } as React.CSSProperties}>
      <Link
        href={`/flights/${encodeURIComponent(flight.id)}`}
        className={styles.ticket}
        onMouseEnter={() => setPreview([flight])}
        onMouseLeave={() => setPreview(null)}
        onFocus={() => setPreview([flight])}
        onBlur={() => setPreview(null)}
      >
        <span className={styles.eyebrow}>
          <span>{countdown.kind === "airborne" ? text.airborne : text.next}</span>
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
        <LegBoard flight={flight} locale={locale} sky={sky} progress={countdown.kind === "airborne" ? countdown.progress : undefined} />
        {firsts.length ? <span className={styles.firsts}>{firsts.slice(0, 2).map((first) => firstText(first, locale)).join(" · ")}</span> : null}
      </Link>
      {companions.length || rest > 0 ? (
        <p className={styles.after}>
          {companions.map((link) => <Owner key={link.id} color={toneColor(link.tone)} label={ui[locale].pair.with(link.name)} />)}
          {rest > 0 ? <Link href="/log" className={styles.more}>{text.more(formatNumber(rest, locale))}<ChevronRight aria-hidden="true" /></Link> : null}
        </p>
      ) : null}
    </section>
  );
}

export function firstText(first: First, locale: Locale) {
  const text = planUi[locale];
  switch (first.kind) {
    case "country": return text.firstCountry(countryName(first.code, locale));
    case "city": return text.firstCity(cityOf(first.code, locale));
    case "airline": return text.firstAirline(carrierName(first.code, locale));
    case "type": return text.firstType(first.name);
    case "farthest": return text.farthest;
  }
}
