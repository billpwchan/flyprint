import type { Flight } from "./data";
import { EARTH_CIRCUMFERENCE_KM } from "./geo";
import { airportsIn, countriesIn, metroOf } from "./places";

export type Summary = {
  flights: number;
  km: number;
  minutes: number;
  airports: number;
  countries: number;
  firstDate: string | null;
  lastDate: string | null;
  earthLaps: number;
};

export type YearCount = { year: number; count: number; km: number };

export type Insights = {
  summary: Summary;
  years: YearCount[];
  latest: { year: number; count: number; previous: YearCount | null; peak: YearCount } | null;
  topPairs: { a: string; b: string; count: number; ids: string[] }[];
  longest: Flight | null;
  firsts: { year: number; airports: string[]; ids: string[] } | null;
};

const ascending = (a: Flight, b: Flight) => a.date.localeCompare(b.date) || a.depart.localeCompare(b.depart);

export function summarize(list: Flight[]): Summary {
  const km = list.reduce((sum, flight) => sum + flight.km, 0);
  const dates = list.map((flight) => flight.date).sort();
  return {
    flights: list.length,
    km,
    minutes: list.reduce((sum, flight) => sum + (flight.durationMinutes || 0), 0),
    airports: airportsIn(list).size,
    countries: countriesIn(list).size,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
    earthLaps: km / EARTH_CIRCUMFERENCE_KM,
  };
}

export function yearCounts(list: Flight[]): YearCount[] {
  if (!list.length) return [];
  const years = list.map((flight) => flight.year);
  const result: YearCount[] = [];
  for (let year = Math.min(...years); year <= Math.max(...years); year++) {
    const values = list.filter((flight) => flight.year === year);
    result.push({ year, count: values.length, km: values.reduce((sum, flight) => sum + flight.km, 0) });
  }
  return result;
}

export function cityPairs(list: Flight[]) {
  const pairs = new Map<string, { a: string; b: string; count: number; ids: string[] }>();
  for (const flight of list) {
    const [a, b] = [metroOf(flight.origin), metroOf(flight.destination)].sort();
    const key = `${a}|${b}`;
    const entry = pairs.get(key) ?? { a: a === metroOf(flight.origin) ? flight.origin : flight.destination, b: b === metroOf(flight.destination) ? flight.destination : flight.origin, count: 0, ids: [] };
    entry.count++; entry.ids.push(flight.id);
    pairs.set(key, entry);
  }
  return [...pairs.values()].sort((x, y) => y.count - x.count);
}

export function buildInsights(list: Flight[]): Insights {
  const years = yearCounts(list);
  const latestYear = years.at(-1);
  const peak = years.reduce<YearCount | null>((best, year) => !best || year.count > best.count ? year : best, null);
  const previous = latestYear ? years.find((year) => year.year === latestYear.year - 1) ?? null : null;

  const ordered = [...list].sort(ascending);
  const seen = new Set<string>();
  const firstVisitYear = new Map<string, number>();
  for (const flight of ordered) {
    for (const code of [flight.origin, flight.destination]) {
      if (!seen.has(code)) { seen.add(code); firstVisitYear.set(code, flight.year); }
    }
  }
  const firstsYear = latestYear?.year;
  const firstAirports = firstsYear ? [...firstVisitYear.entries()].filter(([, year]) => year === firstsYear).map(([code]) => code) : [];
  const firstIds = list.filter((flight) => flight.year === firstsYear && (firstAirports.includes(flight.origin) || firstAirports.includes(flight.destination))).map((flight) => flight.id);

  return {
    summary: summarize(list),
    years,
    latest: latestYear && peak ? { year: latestYear.year, count: latestYear.count, previous, peak } : null,
    topPairs: cityPairs(list).slice(0, 3),
    longest: list.reduce<Flight | null>((best, flight) => !best || flight.km > best.km ? flight : best, null),
    firsts: firstsYear && firstAirports.length && firstVisitYear.size > firstAirports.length ? { year: firstsYear, airports: firstAirports, ids: firstIds } : null,
  };
}
