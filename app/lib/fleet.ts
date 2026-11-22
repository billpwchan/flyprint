import type { Flight } from "./data";
import { compareText } from "./data";
import { aircraftType, type AircraftType, type Maker } from "./aircraft/catalog";
import { localeIndex, type Locale } from "./i18n";
import { metroOf } from "./places";

const MAKERS: Record<Maker, [string, string, string]> = {
  airbus: ["空客", "空中巴士", "Airbus"],
  boeing: ["波音", "波音", "Boeing"],
};
export const makerName = (maker: Maker, locale: Locale) => MAKERS[maker][localeIndex(locale)];

// A type the reader flew: its catalogue entry when it can be drawn, otherwise
// the most common name the records give it.
export type TypeEntry = {
  icao: string;
  type: AircraftType | null;
  model: string;
  flights: Flight[];
  first: string;
  last: string;
};

const byDate = (a: Flight, b: Flight) => a.date.localeCompare(b.date) || a.depart.localeCompare(b.depart);

export function typesIn(list: Flight[]): TypeEntry[] {
  const groups = new Map<string, Flight[]>();
  for (const flight of list) {
    const icao = flight.aircraft?.icao?.toUpperCase();
    if (!icao) continue;
    groups.set(icao, [...(groups.get(icao) ?? []), flight]);
  }
  return [...groups.entries()].map(([icao, flights]) => {
    const sorted = flights.slice().sort(byDate);
    const names = new Map<string, number>();
    for (const flight of sorted) names.set(flight.aircraft!.model, (names.get(flight.aircraft!.model) ?? 0) + 1);
    const model = [...names.entries()].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))[0][0];
    return { icao, type: aircraftType(icao), model, flights: sorted, first: sorted[0].date, last: sorted.at(-1)!.date };
  }).sort((a, b) => b.flights.length - a.flights.length || compareText(a.icao, b.icao));
}

// "空客 A330-300", or the records' own name for a type the catalogue lacks.
export const typeName = (entry: { type: AircraftType | null; model: string }, locale: Locale) =>
  entry.type ? `${makerName(entry.type.maker, locale)} ${entry.type.name}` : entry.model;

export type CarrierEntry = { code: string; flights: Flight[]; first: string; last: string; km: number; minutes: number };

export function carriersIn(list: Flight[]): CarrierEntry[] {
  const groups = new Map<string, Flight[]>();
  // A flight whose carrier could not be named has no airline to count.
  for (const flight of list) if (flight.airline) groups.set(flight.airline, [...(groups.get(flight.airline) ?? []), flight]);
  return [...groups.entries()].map(([code, flights]) => {
    const sorted = flights.slice().sort(byDate);
    return {
      code,
      flights: sorted,
      first: sorted[0].date,
      last: sorted.at(-1)!.date,
      km: sorted.reduce((sum, flight) => sum + flight.km, 0),
      minutes: sorted.reduce((sum, flight) => sum + flight.durationMinutes, 0),
    };
  }).sort((a, b) => b.flights.length - a.flights.length || compareText(a.code, b.code));
}

// Airframes by registration, most flown first.
export function tailsIn(list: Flight[]) {
  const groups = new Map<string, Flight[]>();
  for (const flight of list) {
    const registration = flight.aircraft?.registration;
    if (registration) groups.set(registration, [...(groups.get(registration) ?? []), flight]);
  }
  return [...groups.entries()]
    .map(([registration, flights]) => ({ registration, flights: flights.slice().sort(byDate) }))
    .sort((a, b) => b.flights.length - a.flights.length || b.flights.at(-1)!.date.localeCompare(a.flights.at(-1)!.date));
}

// City pairs in either direction, most flown first.
export function routesIn(list: Flight[]) {
  const groups = new Map<string, { a: string; b: string; flights: Flight[] }>();
  for (const flight of list) {
    const [a, b] = [flight.origin, flight.destination].sort((x, y) => compareText(metroOf(x), metroOf(y)));
    const key = `${metroOf(a)}|${metroOf(b)}`;
    const entry = groups.get(key) ?? { a, b, flights: [] };
    entry.flights.push(flight);
    groups.set(key, entry);
  }
  return [...groups.values()].sort((x, y) => y.flights.length - x.flights.length || compareText(x.a + x.b, y.a + y.b));
}

// "Airbus A330-300" from the records reads "空客 A330-300" in Chinese.
export function localModel(model: string, locale: Locale) {
  const maker = model.match(/^(Airbus|Boeing)\s+/i);
  return maker ? `${makerName(maker[1].toLowerCase() as "airbus" | "boeing", locale)} ${model.slice(maker[0].length)}` : model;
}
