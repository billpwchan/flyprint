"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { Flight } from "../../lib/data";
import type { Locale } from "../../lib/i18n";
import { sunAt } from "../../lib/daylight";
import { coordinatesOf } from "../../lib/places";
import { NOON, addDays, daytime, degrees, hourOf, weatherWord, windowLook, type WeatherDay, type WindowLook } from "../../lib/weather";
import styles from "./Weather.module.css";

// Weather is asked of this site, which asks Open-Meteo and keeps the answer.
// Days already fetched in this tab are not asked for again.
const known = new Map<string, WeatherDay | null>();
const pending = new Map<string, Promise<void>>();

async function load(keys: string[]) {
  const wanted = keys.filter((key) => !known.has(key) && !pending.has(key));
  for (let i = 0; i < wanted.length; i += 60) {
    const batch = wanted.slice(i, i + 60);
    const job = fetch(`/api/weather?at=${batch.map((key) => key.replace(" ", ":")).join(",")}`)
      .then((response) => response.ok ? response.json() as Promise<{ days: Record<string, WeatherDay | null> }> : null)
      .then((answer) => { for (const key of batch) known.set(key, answer?.days[key] ?? null); })
      .catch(() => { for (const key of batch) known.set(key, null); })
      .finally(() => { for (const key of batch) pending.delete(key); });
    for (const key of batch) pending.set(key, job);
  }
  await Promise.all(keys.map((key) => pending.get(key)).filter(Boolean));
}

export function useWeather(keys: string[]) {
  const signature = keys.join(",");
  const [, bump] = useState(0);
  useEffect(() => {
    if (!signature) return;
    let live = true;
    load(signature.split(",")).then(() => { if (live) bump((n) => n + 1); });
    return () => { live = false; };
  }, [signature]);
  return (key: string) => known.get(key) ?? null;
}

// A plane's window with the weather outside it: the sky at that hour, grey
// with cloud, with the rain or snow going past. One drawing for every place
// the site names a time and a place.
// Listed so that the first few already spread over the pane.
const RAIN: [number, number][] = [[10, 9], [20, 20], [14, 30], [23, 9], [11, 19], [17, 4], [7, 28], [24, 29]];
const SNOW: [number, number][] = [[9, 9], [20, 20], [15, 30], [23, 12], [11, 19], [17, 6], [8, 27], [23, 31]];
const STARS: [number, number, number][] = [[8.5, 9, 0.55], [14, 15, 0.45], [22.5, 21, 0.5], [10, 25, 0.4]];
const rgb = (c: [number, number, number]) => `rgb(${c.map(Math.round).join(",")})`;

export function WeatherWindow({ look, size = 22, title }: { look: WindowLook; size?: number; title?: string }) {
  const id = useId().replace(/:/g, "");
  const rain = look.fall === "rain" ? (look.amount === 1 ? 3 : look.amount === 2 ? 5 : 8) : 0;
  const snow = look.fall === "snow" ? (look.amount === 1 ? 4 : look.amount === 2 ? 6 : 8) : 0;
  return (
    <svg className={styles.window} width={size} height={size * 4 / 3} viewBox="0 0 30 40" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={rgb(look.top)} />
          <stop offset="1" stopColor={rgb(look.bottom)} />
        </linearGradient>
        <radialGradient id={`${id}g`}>
          <stop offset="0" stopColor="#fff4d8" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff4d8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.28" />
          <stop offset="0.35" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}c`}><rect x="3" y="3" width="24" height="34" rx="10.5" /></clipPath>
      </defs>
      <rect x="0.5" y="0.5" width="29" height="39" rx="13" className={styles.frame} />
      <g clipPath={`url(#${id}c)`}>
        <rect width="30" height="40" fill={`url(#${id}s)`} />
        {STARS.map(([x, y, r], i) => look.stars > 0 ? <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={look.stars * 0.8} /> : null)}
        {look.sun > 0 ? <><circle cx="20" cy="11" r="9" fill={`url(#${id}g)`} opacity={look.sun} /><circle cx="20" cy="11" r="3.6" fill="#fff6e0" opacity={look.sun} /></> : null}
        {look.moon > 0 ? <path d="M21.6 7.6a4 4 0 1 0 0 7.2a3.3 3.3 0 1 1 0-7.2z" fill="#e6ecff" opacity={look.moon} /> : null}
        {look.cloud > 0 ? (
          <g fill="#fff" opacity={0.22 + 0.4 * look.cloud}>
            <ellipse cx="9" cy="28" rx="10" ry="3.4" />
            <ellipse cx="22" cy="32.5" rx="11" ry="3.6" />
          </g>
        ) : null}
        {look.deck > 0 ? (
          <g fill="#fff" opacity={0.1 * look.deck}>
            <ellipse cx="8" cy="9" rx="13" ry="4" />
            <ellipse cx="24" cy="18" rx="12" ry="3.6" />
            <ellipse cx="10" cy="27" rx="14" ry="3.8" />
          </g>
        ) : null}
        {look.fog ? <g fill="#fff" opacity="0.32"><rect x="2" y="19" width="26" height="2.6" rx="1.3" /><rect x="5" y="25" width="23" height="2.6" rx="1.3" /><rect x="2" y="31" width="22" height="2.6" rx="1.3" /></g> : null}
        {rain ? <g stroke="#fff" strokeOpacity="0.75" strokeWidth="1.3" strokeLinecap="round">{RAIN.slice(0, rain).map(([x, y], i) => <line key={i} x1={x} y1={y} x2={x - 2} y2={y + 5.5} />)}</g> : null}
        {snow ? <g fill="#fff" opacity="0.9">{SNOW.slice(0, snow).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.25" />)}</g> : null}
        {look.bolt ? <path d="M16.5 12l-4.5 8h3.4l-2 7.5l6-9.5h-3.6l2.2-6z" fill="#ffe58a" /> : null}
        <rect width="30" height="40" fill={`url(#${id}d)`} />
      </g>
      <rect x="3" y="3" width="24" height="34" rx="10.5" className={styles.glass} />
    </svg>
  );
}

const keyOf = (code: string, date: string) => `${code} ${date}`;

function hourLook(day: WeatherDay, hour: number, elevation: number | null) {
  const [, code, cloud, , isDay] = day.hours[hour] ?? [];
  const fallback = isDay ? NOON : -20;
  return windowLook(elevation ?? fallback, cloud ?? 0, code ?? day.code);
}

// The weather where the flight left and where it landed, at those hours.
export function FlightWeather({ flight, locale }: { flight: Flight; locale: Locale }) {
  const arrival = addDays(flight.date, flight.arrivalDayOffset ?? 0);
  const keys = useMemo(() => [keyOf(flight.origin, flight.date), keyOf(flight.destination, arrival)], [flight.origin, flight.destination, flight.date, arrival]);
  const weather = useWeather(keys);
  const ends = [
    { day: weather(keys[0]), clock: flight.depart, at: flight.departAt, code: flight.origin, label: WHEN[locale][0] },
    { day: weather(keys[1]), clock: flight.arrive, at: flight.departAt != null ? flight.departAt + flight.durationMinutes * 60_000 : undefined, code: flight.destination, label: WHEN[locale][1] },
  ];
  if (!ends[0].day && !ends[1].day) return null;
  return (
    <div className={styles.ends}>
      {ends.map((end, index) => {
        if (!end.day) return <span key={index} />;
        const hour = hourOf(end.clock);
        const elevation = end.at != null ? sunAt(end.at, coordinatesOf(end.code)).elevation : null;
        const entry = hour != null ? end.day.hours[hour] : null;
        const look = hour != null ? hourLook(end.day, hour, elevation) : windowLook(NOON, daytime(end.day).cloud, daytime(end.day).code);
        const temp = entry?.[0] ?? null;
        const word = weatherWord(entry?.[1] ?? daytime(end.day).code, locale);
        return (
          <span key={index} className={styles.end} data-side={index ? "arrive" : "depart"}>
            <WeatherWindow look={look} size={24} />
            <span>
              <b>{temp != null ? degrees(temp) : `${degrees(end.day.hi)} / ${degrees(end.day.lo)}`}</b> {word}
              <small>{hour != null ? end.label : WHEN[locale][2]}</small>
            </span>
          </span>
        );
      })}
    </div>
  );
}

const WHEN: Record<Locale, [string, string, string]> = {
  "zh-Hans": ["起飞时", "落地时", "当天"],
  "zh-Hant": ["起飛時", "落地時", "當天"],
  en: ["At take-off", "On landing", "That day"],
};

// Each day of a stay as its window at midday, with the day's high and low.
export function StayDays({ code, from, to, locale }: { code: string; from: string; to: string; locale: Locale }) {
  const days = useMemo(() => {
    const out: string[] = [];
    for (let date = from; date <= to && out.length < 22; date = addDays(date, 1)) out.push(date);
    return out;
  }, [from, to]);
  const keys = useMemo(() => days.map((date) => keyOf(code, date)), [code, days]);
  const weather = useWeather(keys);
  if (!keys.some((key) => weather(key))) return null;
  const format = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" });
  return (
    <ol className={styles.days}>
      {days.map((date, index) => {
        const day = weather(keys[index]);
        const when = format.format(new Date(`${date}T00:00:00Z`));
        if (!day) return <li key={date} className={styles.unknown} title={when}><span className={styles.blank} /></li>;
        const light = daytime(day);
        const word = weatherWord(light.code, locale);
        return (
          <li key={date} title={`${when} · ${word} · ${degrees(day.hi)} / ${degrees(day.lo)}`}>
            <WeatherWindow look={windowLook(NOON, light.cloud, light.code)} size={18} title={`${when} ${word}`} />
            <b>{degrees(day.hi)}</b>
            <span>{degrees(day.lo)}</span>
          </li>
        );
      })}
    </ol>
  );
}
