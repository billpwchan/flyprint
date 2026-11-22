"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Flight } from "../../lib/data";
import type { Locale } from "../../lib/i18n";
import { EARTH_CIRCUMFERENCE_KM, MOON_DISTANCE_KM } from "../../lib/geo";
import { lightRGBA, skyAlong } from "../../lib/daylight";
import { cityOf, coordinatesOf, countryName, metroOf } from "../../lib/places";
import { formatNumber } from "../../lib/copy";
import type { Country } from "../../lib/footprint";
import type { Trip } from "../../lib/trips";
import CityImage from "../common/CityImage";
import CountryMark from "../common/CountryMark";
import styles from "./Footprint.module.css";

// The footprint drawn rather than listed, section by section as the app
// draws it (RecordsView.swift): the distance coiled round the Earth, every
// hour aloft as a square of the sky outside, the countries as their own
// outlines and the cities as they look from above.

const t = (locale: Locale, hans: string, hant: string, en: string) => locale === "en" ? en : locale === "zh-Hant" ? hant : hans;
const decimal = (value: number, locale: Locale, digits = 1) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);

function Head({ value, unit, detail }: { value: string; unit: string; detail?: string }) {
  return (
    <header className={styles.head}>
      <h2><b>{value}</b><span>{unit}</span></h2>
      {detail ? <p>{detail}</p> : null}
    </header>
  );
}

// The distance wound round the Earth: one turn for each lap of the equator,
// the last drawn as far as it got.
export function Distance({ flights, locale, tone }: { flights: Flight[]; locale: Locale; tone: string }) {
  const km = flights.reduce((sum, flight) => sum + flight.km, 0);
  const laps = km / EARTH_CIRCUMFERENCE_KM;
  const share = km / MOON_DISTANCE_KM;
  const percent = `${decimal(share * 100, locale, share < 0.1 ? 1 : 0)}%`;
  const coil = useMemo(() => {
    const side = 260, center = side / 2, earth = side * 0.2, outer = side / 2 - 6;
    const gap = Math.min(7, (outer - earth - 10) / Math.max(1, laps));
    const steps = Math.max(60, Math.round(laps * 160));
    const turns = laps * 2 * Math.PI;
    const points: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const theta = (turns * i) / steps;
      const r = earth + 9 + (gap * theta) / (2 * Math.PI);
      points.push(`${(center + r * Math.sin(theta)).toFixed(1)},${(center - r * Math.cos(theta)).toFixed(1)}`);
    }
    const r = earth + 9 + gap * laps;
    return { side, center, earth, outer, path: `M${points.join("L")}`, end: [center + r * Math.sin(turns), center - r * Math.cos(turns)] };
  }, [laps]);
  return (
    <section className={styles.section}>
      <Head
        value={decimal(laps, locale)}
        unit={t(locale, "圈地球", "圈地球", laps < 1.05 ? "time around the Earth" : "times around the Earth")}
        detail={t(locale, `${formatNumber(km, locale)} 公里，是到月球距离的 ${percent}`, `${formatNumber(km, locale)} 公里，是到月球距離的 ${percent}`, `${formatNumber(km, locale)} km, ${percent} of the way to the Moon`)}
      />
      <svg className={styles.coil} viewBox={`0 0 ${coil.side} ${coil.side}`} aria-hidden="true" style={{ "--tone": tone } as React.CSSProperties}>
        <defs>
          <radialGradient id="coil-earth" cx="0.35" cy="0.35" r="0.7">
            <stop offset="0" stopColor="rgb(31, 38, 51)" />
            <stop offset="1" stopColor="rgb(13, 15, 20)" />
          </radialGradient>
          <linearGradient id="coil-line" gradientUnits="userSpaceOnUse" x1={coil.center} y1={coil.center} x2={coil.center + coil.outer} y2={coil.center + coil.outer}>
            <stop offset="0" stopColor={tone} stopOpacity="0.35" />
            <stop offset="1" stopColor={tone} />
          </linearGradient>
          <filter id="coil-glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        <circle cx={coil.center} cy={coil.center} r={coil.earth} fill="url(#coil-earth)" stroke="rgba(135, 174, 221, 0.35)" strokeWidth="1" />
        <path d={coil.path} fill="none" stroke={tone} strokeOpacity="0.35" strokeWidth="2.5" filter="url(#coil-glow)" />
        <path d={coil.path} fill="none" stroke="url(#coil-line)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={coil.end[0]} cy={coil.end[1]} r="3.5" fill="#fff" />
      </svg>
    </section>
  );
}

// Every hour aloft as one square, coloured by the sky outside the window at
// that hour; a row is a day.
export function Aloft({ flights, locale }: { flights: Flight[]; locale: Locale }) {
  const { cells, dark } = useMemo(() => {
    const cells: string[] = [];
    let dark = 0;
    for (const flight of flights) {
      const count = Math.max(1, Math.round(flight.durationMinutes / 60));
      const sky = flight.departAt && flight.durationMinutes > 0
        ? skyAlong(coordinatesOf(flight.origin), coordinatesOf(flight.destination), flight.departAt, flight.durationMinutes, 24)
        : null;
      if (!sky?.light.length) {
        for (let i = 0; i < count; i++) cells.push("rgba(153, 166, 191, 0.16)");
        continue;
      }
      if (sky.light.every((point) => point.degrees < -6)) dark += 1;
      for (let hour = 0; hour < count; hour++) {
        const at = (hour + 0.5) / count;
        const next = Math.max(0, sky.light.findIndex((point) => point.at >= at));
        const a = sky.light[Math.max(0, next - 1)], b = sky.light[next];
        const k = b.at > a.at ? Math.max(0, Math.min(1, (at - a.at) / (b.at - a.at))) : 0;
        const [r, g, bl, alpha] = lightRGBA(a.degrees + (b.degrees - a.degrees) * k);
        cells.push(`rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(bl)}, ${Math.max(0.16, alpha).toFixed(2)})`);
      }
    }
    return { cells, dark };
  }, [flights]);
  const minutes = flights.reduce((sum, flight) => sum + flight.durationMinutes, 0);
  const hours = formatNumber(Math.round(minutes / 60), locale);
  const columns = cells.length > 1200 ? 48 : 24;
  return (
    <section className={styles.section}>
      <Head
        value={decimal(minutes / 1440, locale)}
        unit={t(locale, "天在空中", "天在空中", "days in the air")}
        detail={t(locale, `${hours} 小时，${dark} 班全程夜航`, `${hours} 小時，${dark} 班全程夜航`, `${hours} hours; ${dark} in the dark all the way`)}
      />
      <div className={styles.aloft} style={{ "--columns": columns } as React.CSSProperties} aria-hidden="true">
        {cells.map((color, index) => <i key={index} style={{ background: color }} />)}
      </div>
      <p className={styles.note}>{t(locale, "每格是一小时，颜色是那一刻窗外的天色；每行是一天。", "每格是一小時，顏色是那一刻窗外的天色；每行是一天。", "Each square is an hour, coloured by the sky outside at the time; each row is a day.")}</p>
    </section>
  );
}

// The countries as their own outlines, in the order first reached; one
// pressed lights its flights on the globe.
export function Countries({ countries, locale, tone, pinned, onPin, onPreview }: {
  countries: Country[];
  locale: Locale;
  tone: string;
  pinned: string | null;
  onPin: (key: string | null) => void;
  onPreview: (flights: Flight[] | null) => void;
}) {
  const ordered = useMemo(() => [...countries].sort((a, b) => a.first.localeCompare(b.first)), [countries]);
  return (
    <section className={styles.section}>
      <Head value={formatNumber(countries.length, locale)} unit={t(locale, "个国家和地区", "個國家和地區", countries.length === 1 ? "country" : "countries")} />
      <ol className={styles.countries}>
        {ordered.map((country) => {
          const key = `country:${country.iso}`;
          return (
            <li key={country.iso}>
              <button
                type="button"
                aria-pressed={pinned === key}
                onClick={() => onPin(pinned === key ? null : key)}
                onMouseEnter={() => onPreview(country.flights)}
                onMouseLeave={() => onPreview(null)}
              >
                <CountryMark iso={country.iso} size={44} color={tone} />
                <strong>{countryName(country.iso, locale)}</strong>
                <small>{country.first.slice(0, 4)}</small>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// The cities stayed in (homes aside), each as it looks from above, the most
// stayed in first. linked: whether each opens its place page, which only the
// owner has.
export function Cities({ trips, homes, flights, locale, onPreview, linked = true }: {
  trips: Trip[];
  homes: Set<string>;
  flights: Flight[];
  locale: Locale;
  onPreview: (flights: Flight[] | null) => void;
  linked?: boolean;
}) {
  const places = useMemo(() => {
    const count = new Map<string, { trips: number; last: string; code: string }>();
    for (const trip of trips) {
      const here = new Set([trip.destination, ...trip.stays].map(metroOf));
      for (const metro of here) {
        if (homes.has(metro)) continue;
        const seen = count.get(metro);
        const code = [trip.destination, ...trip.stays].find((stop) => metroOf(stop) === metro)!;
        count.set(metro, { trips: (seen?.trips ?? 0) + 1, last: seen && seen.last > trip.start ? seen.last : trip.start, code: seen?.code ?? code });
      }
    }
    return [...count.entries()].map(([metro, entry]) => ({ metro, ...entry }))
      .sort((a, b) => b.trips - a.trips || b.last.localeCompare(a.last));
  }, [trips, homes]);
  const touching = (metro: string) => flights.filter((flight) => metroOf(flight.origin) === metro || metroOf(flight.destination) === metro);
  if (!places.length) return null;
  return (
    <section className={styles.section}>
      <Head value={formatNumber(places.length, locale)} unit={t(locale, "座城市", "座城市", places.length === 1 ? "city" : "cities")} />
      <ol className={styles.cities}>
        {places.map((place) => {
          const inside = (
            <>
              <CityImage code={place.code} className={styles.cityImage} />
              <strong>{cityOf(place.code, locale)}</strong>
              <small>{t(locale, `${place.trips} 次`, `${place.trips} 次`, place.trips === 1 ? "1 trip" : `${place.trips} trips`)}</small>
            </>
          );
          const hover = { onMouseEnter: () => onPreview(touching(place.metro)), onMouseLeave: () => onPreview(null) };
          return (
            <li key={place.metro}>
              {linked
                ? <Link href={`/places/${encodeURIComponent(place.metro)}`} {...hover} onFocus={() => onPreview(touching(place.metro))} onBlur={() => onPreview(null)}>{inside}</Link>
                : <div {...hover}>{inside}</div>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
