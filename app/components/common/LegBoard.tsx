import type { Flight } from "../../lib/data";
import { formatDuration, formatNumber, ui } from "../../lib/copy";
import { carrierName, type Locale } from "../../lib/i18n";
import { cityOf } from "../../lib/places";
import { lightColor, skyGradient, type Sky } from "../../lib/daylight";
import CarrierMark from "../CarrierMark";
import styles from "./common.module.css";

// Departure and arrival as on a departures board: codes large, local times
// beneath. With `sky` the line between them shows day and night along the way;
// with `progress` (0–1) a mark shows where a flight in the air is now.
export function LegBoard({ flight, locale, large = false, sky, progress }: { flight: Flight; locale: Locale; large?: boolean; sky?: Sky | null; progress?: number }) {
  const text = ui[locale];
  const offset = flight.arrivalDayOffset ?? 0;
  const mark = progress !== undefined ? <b className={styles.now} style={{ left: `${(progress * 100).toFixed(2)}%` }} /> : null;
  return (
    <div className={styles.board} data-large={large ? "true" : undefined}>
      <div className={styles.end}>
        <strong>{flight.origin}</strong>
        <span>{cityOf(flight.origin, locale)}</span>
        <time>{flight.depart}</time>
      </div>
      <div className={styles.path} aria-hidden="true">
        <span>{formatDuration(flight.durationMinutes, locale)}</span>
        {sky ? <i data-sky="true" style={{ background: skyGradient(sky), "--end": lightColor(sky.light.at(-1)!.degrees) } as React.CSSProperties}>{mark}</i> : <i>{mark}</i>}
        <span>{formatNumber(flight.km, locale)} {text.units.km}</span>
      </div>
      <div className={`${styles.end} ${styles.arrive}`}>
        <strong>{flight.destination}</strong>
        <span>{cityOf(flight.destination, locale)}</span>
        <time>{flight.arrive}{offset ? <sup>{offset > 0 ? `+${offset}` : offset}</sup> : null}</time>
      </div>
    </div>
  );
}

export function CarrierLine({ flight, locale }: { flight: Flight; locale: Locale }) {
  return (
    <p className={styles.carrier}>
      <CarrierMark airline={flight.airline} size={18} />
      <span className={styles.flightNo}>{flight.flight}</span>
      <span>{carrierName(flight.airline, locale)}</span>
      <span className={styles.aircraft}>{flight.aircraft?.model ?? ui[locale].trip.aircraftUnknown}</span>
    </p>
  );
}
