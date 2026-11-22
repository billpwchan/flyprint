import airportTable from "./airports.json";
import curated from "./names.json";
import builtCarriers from "./carriers.json";
import builtPlaces from "./places.json";
import countryTable from "./countries.json";
import { database } from "./db";
import type { Archive, Flight, Names, Place } from "../data";
import type { LngLat } from "../geo";
import { airportOfMetro, metroOf } from "../places";

// Every airport with an IATA code (mwgg/Airports, MIT): position, country, time
// zone and English names. Chinese names come from the curated table, then the
// built ones (scripts/build-places.mjs, build-airlines.mjs), then names
// learned while importing (see localize in import/claude.ts).

type Row = [lon: number, lat: number, country: string, tz: string, city: string, name: string, icao: string];
const airports = airportTable as unknown as Record<string, Row>;
const countries = countryTable as unknown as Record<string, Names>;
const curatedPlaces = curated.places as unknown as Record<string, { city: Names; name: Names }>;
const curatedCarriers = curated.carriers as unknown as Record<string, Names>;
// [cityHans, cityHant, nameHans, nameHant]; a blank means Wikidata had none.
const generatedPlaces = builtPlaces as unknown as Record<string, [string, string, string, string]>;
const generatedCarriers = builtCarriers.names as unknown as Record<string, Names>;
// Every airline's Chinese names, for archives that name carriers in Chinese.
// A name two airlines share resolves to neither.
const spellings = new Map<string, string | null>();
for (const [code, [hans, hant]] of Object.entries(generatedCarriers)) {
  for (const name of new Set([hans, hant])) {
    if (/[㐀-鿿]/u.test(name)) spellings.set(name, spellings.has(name) && spellings.get(name) !== code ? null : code);
  }
}
export const carrierAliases: Record<string, string> = {
  ...Object.fromEntries([...spellings].filter((entry): entry is [string, string] => entry[1] !== null)),
  ...(curated.carrierAliases as Record<string, string>),
};
export const carrierDesignators = builtCarriers.icao as Record<string, string>;

export type AirportInfo = { code: string; coordinates: LngLat; country: string; tz: string; city: string; name: string; icao: string };

export function airport(code: string): AirportInfo | null {
  const row = airports[code];
  return row ? { code, coordinates: [row[0], row[1]], country: row[2], tz: row[3], city: row[4], name: row[5], icao: row[6] } : null;
}

let icaoIndex: Map<string, string> | null = null;
export function iataOfIcao(icao: string) {
  if (!icaoIndex) {
    icaoIndex = new Map();
    for (const [code, row] of Object.entries(airports)) if (row[6]) icaoIndex.set(row[6], code);
  }
  return icaoIndex.get(icao) ?? null;
}

// A code as written in an export ("PVG", "ZSPD", "Shanghai (PVG/ZSPD)") to an IATA code we know.
export function airportCode(text: string): string | null {
  const value = text.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(value) && airports[value]) return value;
  if (/^[A-Z]{4}$/.test(value)) return iataOfIcao(value);
  const inside = value.match(/\(([A-Z]{3})(?:\s*\/\s*[A-Z]{4})?\)|\b([A-Z]{3})\s*\/\s*[A-Z]{4}\b/);
  const code = inside?.[1] ?? inside?.[2];
  if (code && airports[code]) return code;
  const icao = value.match(/\(([A-Z]{4})\)|\/([A-Z]{4})\)/);
  return icao ? iataOfIcao(icao[1] ?? icao[2]) : null;
}

type Learned = { places: Map<string, { city: Names; name: Names }>; carriers: Map<string, Names> };
let learned: Learned | null = null;

function learnedNames(): Learned {
  if (learned) return learned;
  const rows = database().prepare("SELECT kind, code, value FROM names").all() as { kind: string; code: string; value: string }[];
  const next: Learned = { places: new Map(), carriers: new Map() };
  for (const row of rows) {
    try {
      const value = JSON.parse(row.value);
      if (row.kind === "place") next.places.set(row.code, value);
      else if (row.kind === "carrier") next.carriers.set(row.code, value);
    } catch { /* a bad row only costs its translation */ }
  }
  learned = next;
  return next;
}

export function rememberNames(kind: "place" | "carrier", entries: Record<string, unknown>) {
  const statement = database().prepare("INSERT INTO names (kind, code, value) VALUES (?, ?, ?) ON CONFLICT (kind, code) DO UPDATE SET value = excluded.value");
  for (const [code, value] of Object.entries(entries)) statement.run(kind, code, JSON.stringify(value));
  learned = null;
}

export const hasPlaceNames = (code: string) => !!curatedPlaces[code] || !!generatedPlaces[code]?.[0] || learnedNames().places.has(code);
export const hasCarrierNames = (code: string) => !!curatedCarriers[code] || !!generatedCarriers[code] || learnedNames().carriers.has(code);

function builtPlaceNames(code: string, city: string, name: string) {
  const row = generatedPlaces[code];
  if (!row) return null;
  return { city: [row[0] || city, row[1] || row[0] || city, city] as Names, name: [row[2] || name, row[3] || row[2] || name, name] as Names };
}

export function placeFor(code: string): Place | null {
  const info = airport(code);
  if (!info) return null;
  const city = info.city || info.name;
  const names = curatedPlaces[code] ?? (generatedPlaces[code]?.[0] ? builtPlaceNames(code, city, info.name) : null) ?? learnedNames().places.get(code) ?? builtPlaceNames(code, city, info.name);
  return {
    city: names?.city ?? [city, city, city],
    name: names?.name ?? [info.name, info.name, info.name],
    country: info.country,
    coordinates: info.coordinates,
  };
}

export const carrierFor = (code: string): Names => curatedCarriers[code] ?? generatedCarriers[code] ?? learnedNames().carriers.get(code) ?? [code, code, code];
export const countryFor = (iso: string): Names | null => countries[iso] ?? null;

// Names and positions for every code a list of flights uses, plus the airport
// that stands for each metro area they touch.
export function atlasFor(flights: Flight[]): Pick<Archive, "places" | "carriers" | "countries"> {
  const codes = new Set<string>();
  const carrierCodes = new Set<string>();
  for (const flight of flights) {
    for (const code of [flight.origin, flight.destination]) { codes.add(code); codes.add(airportOfMetro(metroOf(code))); }
    if (flight.airline) carrierCodes.add(flight.airline);
    if (flight.operation?.airline) carrierCodes.add(flight.operation.airline);
  }
  const places: Record<string, Place> = {};
  const isos = new Set<string>();
  for (const code of [...codes].sort()) {
    const place = placeFor(code);
    if (place) { places[code] = place; isos.add(place.country); }
  }
  const carriers: Record<string, Names> = {};
  for (const code of [...carrierCodes].sort()) carriers[code] = carrierFor(code);
  const countryNames: Record<string, Names> = {};
  for (const iso of [...isos].sort()) { const names = countryFor(iso); if (names) countryNames[iso] = names; }
  return { places, carriers, countries: countryNames };
}

// Great-circle distance in kilometres.
export function distanceKm(from: LngLat, to: LngLat) {
  const rad = Math.PI / 180;
  const [lon1, lat1] = from, [lon2, lat2] = to;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a))));
}

// "CX 0255", "cx255" → ["CX", "255"]; IATA designators may mix a digit in (3U, 9C).
export function splitFlightNumber(text: string): [string, string] | null {
  const value = text.toUpperCase().replace(/[\s-]+/g, "");
  const iata = value.match(/^([A-Z]\d|\d[A-Z]|[A-Z]{2})0*(\d{1,4}[A-Z]?)$/);
  if (iata) return [iata[1], iata[2]];
  const icao = value.match(/^([A-Z]{3})0*(\d{1,4}[A-Z]?)$/);
  return icao ? [icao[1], icao[2]] : null;
}
