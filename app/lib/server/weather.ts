import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import airportTable from "./airports.json";
import { dataDir } from "./db";
import type { WeatherDay, WeatherHour } from "../weather";

// The weather at an airport on a day, from Open-Meteo (free, no account,
// non-commercial use with attribution): its reanalysis for days past and its
// forecast for the days ahead. The server asks and keeps the answer, so
// Open-Meteo sees which coordinates and days were wanted, never by whom.
// Hours are local to the airport, so a flight's local time reads straight off.
// They are asked for in UTC and placed by the airport's own time zone here:
// Open-Meteo gives a whole answer one fixed offset, the one in force when it
// is asked, which puts a summer day asked in winter an hour out.

type AirportRow = [number, number, string, string, ...unknown[]];
const airports = airportTable as unknown as Record<string, AirportRow>;

const upstream = () => process.env.FLYPRINT_WEATHER_UPSTREAM;
const ARCHIVE = () => upstream() ? `${upstream()}/archive` : "https://archive-api.open-meteo.com/v1/archive";
const FORECAST = () => upstream() ? `${upstream()}/forecast` : "https://api.open-meteo.com/v1/forecast";
const HOURLY = "temperature_2m,weather_code,cloud_cover,precipitation,is_day";
const DAY = 86_400_000;
// Reanalysis settles about five days after the fact; past this it never changes.
const SETTLED_AFTER = 7;
// The forecast reaches 15 days in UTC; a local day needs the UTC day after it.
const AHEAD = 14;
// Open-Meteo's free tier allows 10,000 calls a day; the site keeps well under.
const CALLS_PER_DAY = 3000;
export const MAX_ASKED = 64;
// Calls upstream one ask may cause; what is left is answered on a later ask.
export const MAX_RUNS = 8;

let store: DatabaseSync | null = null;
function cache() {
  if (store) return store;
  mkdirSync(dataDir(), { recursive: true });
  store = new DatabaseSync(join(dataDir(), "weather.sqlite"));
  store.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS days (
      place TEXT NOT NULL,
      day TEXT NOT NULL,
      data TEXT NOT NULL,
      settled INTEGER NOT NULL,
      fetched INTEGER NOT NULL,
      PRIMARY KEY (place, day)
    );`);
  return store;
}

let budget = { day: "", calls: 0 };
function spend() {
  const today = new Date().toISOString().slice(0, 10);
  if (budget.day !== today) budget = { day: today, calls: 0 };
  if (budget.calls >= CALLS_PER_DAY) return false;
  budget.calls += 1;
  return true;
}

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY);
const dateOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

export const validPlace = (code: string) => /^[A-Z0-9]{3}$/.test(code) && !!airports[code];
// Date.parse rolls 2026-02-30 over to March, so the date must come back as itself.
export const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && dateOf(dayNumber(date)) === date;

type Wanted = { place: string; day: string };
type Kind = "settled" | "recent" | "unavailable";

function kindOf(day: string, today: number): Kind {
  const n = dayNumber(day);
  if (n < dayNumber("1950-01-01") || n > today + AHEAD) return "unavailable";
  return n <= today - SETTLED_AFTER ? "settled" : "recent";
}

// Days at one place close together go in one request; years apart, in several.
function runs(days: string[]) {
  const sorted = [...new Set(days)].map(dayNumber).sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const n of sorted) {
    const last = out.at(-1);
    if (last && n - last[1] <= 7) last[1] = n;
    else out.push([n, n]);
  }
  return out;
}

type Answer = {
  hourly?: { time: string[]; temperature_2m: (number | null)[]; weather_code: (number | null)[]; cloud_cover: (number | null)[]; precipitation: (number | null)[]; is_day: (number | null)[] };
};

const round = (value: number | null | undefined, places = 1) => value == null ? null : Math.round(value * 10 ** places) / 10 ** places;

const clocks = new Map<string, Intl.DateTimeFormat>();
function localClock(zone: string) {
  let clock = clocks.get(zone);
  if (!clock) {
    clock = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
    clocks.set(zone, clock);
  }
  return (at: number) => {
    const parts = Object.fromEntries(clock.formatToParts(at).map((part) => [part.type, part.value]));
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
  };
}

// UTC hours to the airport's days. On the day clocks go forward the skipped
// hour takes the one before it; on the day they go back the repeated hour is
// the first of the two. The day's high, low, rain and worst weather are the
// hours' own (Open-Meteo's daily figures would be UTC days).
export function localDays(answer: Answer, zone: string, from: string, to: string) {
  const out = new Map<string, WeatherDay>();
  const hourly = answer.hourly;
  if (!hourly) return out;
  const clock = localClock(zone);
  const days = new Map<string, (WeatherHour | null)[]>();
  hourly.time.forEach((time, index) => {
    const { day, hour } = clock(Date.parse(`${time}:00Z`));
    if (day < from || day > to) return;
    const hours = days.get(day) ?? Array<WeatherHour | null>(24).fill(null);
    hours[hour] ??= [round(hourly.temperature_2m[index]), hourly.weather_code[index] ?? null, hourly.cloud_cover[index] ?? null, round(hourly.precipitation[index]), hourly.is_day[index] ?? null];
    days.set(day, hours);
  });
  for (const [day, slots] of days) {
    slots[0] ??= slots[1];
    for (let hour = 1; hour < 24; hour++) slots[hour] ??= slots[hour - 1];
    const hours = slots.filter((hour): hour is WeatherHour => hour != null && hour[0] != null);
    // Days too recent for the reanalysis, or past the forecast's last hour, come back empty.
    if (hours.length < 24) continue;
    const temps = hours.map((hour) => hour[0] as number);
    out.set(day, {
      hi: Math.max(...temps), lo: Math.min(...temps),
      code: Math.max(0, ...hours.map((hour) => hour[1] ?? 0)),
      rain: round(hours.reduce((sum, hour) => sum + (hour[3] ?? 0), 0)) ?? 0,
      hours,
    });
  }
  return out;
}

// The same call already on its way is shared, not made twice.
const inFlight = new Map<string, Promise<Map<string, WeatherDay>>>();
function fetchRun(place: string, from: string, to: string, kind: Kind) {
  const key = `${place} ${from} ${to} ${kind}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const job = askUpstream(place, from, to, kind).finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

async function askUpstream(place: string, from: string, to: string, kind: Kind) {
  const [lng, lat, , zone] = airports[place];
  const query = new URLSearchParams({
    latitude: String(lat), longitude: String(lng),
    start_date: dateOf(dayNumber(from) - 1), end_date: dateOf(dayNumber(to) + 1),
    hourly: HOURLY, timezone: "GMT",
  });
  if (!spend()) return new Map<string, WeatherDay>();
  try {
    const response = await fetch(`${kind === "settled" ? ARCHIVE() : FORECAST()}?${query}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return new Map<string, WeatherDay>();
    return localDays(await response.json() as Answer, zone || "UTC", from, to);
  } catch {
    return new Map<string, WeatherDay>();
  }
}

async function limited<T>(tasks: (() => Promise<T>)[], width = 4) {
  const results: T[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, tasks.length) }, async () => {
    while (next < tasks.length) { const index = next++; results[index] = await tasks[index](); }
  }));
  return results;
}

// Keys are "CODE YYYY-MM-DD"; a day with no weather to give is null. At most
// `calls` calls go upstream; `complete` says every day asked for was answered.
export async function weatherFor(wanted: Wanted[], calls = MAX_RUNS) {
  const db = cache();
  const today = Math.floor(Date.now() / DAY);
  const result: Record<string, WeatherDay | null> = {};
  const missing = new Map<string, { kind: Kind; days: string[] }[]>();
  const read = db.prepare("SELECT data, settled, fetched FROM days WHERE place = ? AND day = ?");
  for (const { place, day } of wanted) {
    const key = `${place} ${day}`;
    if (key in result) continue;
    result[key] = null;
    const kind = kindOf(day, today);
    if (kind === "unavailable") continue;
    const row = read.get(place, day) as { data: string; settled: number; fetched: number } | undefined;
    // Days ahead are asked again after three hours, recent days after twelve.
    const fresh = row && (row.settled || Date.now() - row.fetched < (dayNumber(day) > today ? 3 : 12) * 3_600_000);
    if (row) result[key] = JSON.parse(row.data) as WeatherDay;
    if (fresh) continue;
    const groups = missing.get(place) ?? [];
    const group = groups.find((entry) => entry.kind === kind);
    if (group) group.days.push(day); else groups.push({ kind, days: [day] });
    missing.set(place, groups);
  }
  const tasks = [...missing].flatMap(([place, groups]) => groups.flatMap(({ kind, days }) =>
    runs(days).map(([from, to]) => async () => ({ place, kind, found: await fetchRun(place, dateOf(from), dateOf(to), kind) })))).slice(0, Math.max(0, calls));
  const write = db.prepare("INSERT INTO days (place, day, data, settled, fetched) VALUES (?, ?, ?, ?, ?) ON CONFLICT (place, day) DO UPDATE SET data = excluded.data, settled = excluded.settled, fetched = excluded.fetched");
  for (const { place, kind, found } of await limited(tasks)) {
    for (const [day, weather] of found) {
      write.run(place, day, JSON.stringify(weather), kind === "settled" ? 1 : 0, Date.now());
      const key = `${place} ${day}`;
      if (key in result) result[key] = weather;
    }
  }
  const complete = wanted.every(({ place, day }) => result[`${place} ${day}`] != null || kindOf(day, today) === "unavailable");
  return { days: result, calls: tasks.length, complete };
}
