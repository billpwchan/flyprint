import type { Flight } from "./data";
import { airportName, carrierName, cityName, type Locale } from "./i18n";
import { countryName, countryOf, metroOf } from "./places";

const LOCALES: Locale[] = ["zh-Hans", "zh-Hant", "en"];

// Case, accents and spacing never decide a match: "sao paulo" finds São Paulo, "lh 731" finds LH731.
export const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[\s·・\-–—→>]+/g, "");
const words = (query: string) => query.trim().split(/[\s,，、]+/).filter(Boolean);

// Exact filters a link can put in the query, where a loose match would
// overcount: "type:A320" is not the A320neo, "airline:CA" is not Cathay.
// route:SHA/HKG takes metro codes in either order.
const FIELD = /^(type|airline|route):(\S+)$/i;
type Field = { name: string; value: string };
const fieldsOf = (query: string): Field[] => words(query).flatMap((word) => {
  const match = FIELD.exec(word);
  return match ? [{ name: match[1].toLowerCase(), value: match[2].toUpperCase() }] : [];
});
function fieldMatch(flight: Flight, { name, value }: Field) {
  if (name === "type") return (flight.aircraft?.icao ?? "").toUpperCase() === value;
  if (name === "airline") return flight.airline.toUpperCase() === value;
  const [a, b] = value.split("/");
  const x = metroOf(flight.origin), y = metroOf(flight.destination);
  return (x === a && y === b) || (x === b && y === a);
}

export const tokensOf = (query: string) => words(query).filter((word) => !FIELD.test(word)).map(normalize).filter(Boolean);

function placeTerms(code: string) {
  const iso = countryOf(code);
  return [
    code,
    metroOf(code),
    ...LOCALES.flatMap((locale) => [cityName(code, locale), airportName(code, locale, ""), countryName(iso, locale)]),
  ];
}

const flightIndex = new WeakMap<Flight, string>();
function haystack(flight: Flight) {
  let value = flightIndex.get(flight);
  if (value === undefined) {
    const terms = [
      flight.flight,
      flight.airline,
      ...LOCALES.map((locale) => carrierName(flight.airline, locale)),
      flight.operation?.flight ?? "",
      ...placeTerms(flight.origin),
      ...placeTerms(flight.destination),
      flight.aircraft?.model ?? "",
      flight.aircraft?.icao ?? "",
      flight.aircraft?.registration ?? "",
      flight.date,
    ];
    // Fields are fenced so a token never matches across two of them.
    value = terms.map(normalize).filter(Boolean).join("|");
    flightIndex.set(flight, value);
  }
  return value;
}

export function searchFlights(list: Flight[], query: string) {
  const tokens = tokensOf(query);
  const fields = fieldsOf(query);
  if (!tokens.length && !fields.length) return list;
  return list.filter((flight) => {
    if (!fields.every((field) => fieldMatch(flight, field))) return false;
    const hay = haystack(flight);
    return tokens.every((token) => hay.includes(token));
  });
}

// Cities whose names hold every token, so "札幌" offers the city itself above its flights.
export function searchCities(codes: Iterable<string>, query: string) {
  const tokens = tokensOf(query);
  if (!tokens.length) return [];
  const seen = new Set<string>();
  const matches: string[] = [];
  for (const code of codes) {
    const metro = metroOf(code);
    if (seen.has(metro)) continue;
    const hay = placeTerms(code).map(normalize).filter(Boolean).join("|");
    if (tokens.every((token) => hay.includes(token))) { seen.add(metro); matches.push(code); }
  }
  return matches;
}

// Trips whose places, flights or dates hold every token: "东京 2019", "CX 札幌".
const tripIndex = new WeakMap<object, string>();
export function searchTrips<T extends { id: string; flights: Flight[]; start: string; end: string }>(trips: T[], query: string) {
  const tokens = tokensOf(query);
  const fields = fieldsOf(query);
  if (!tokens.length && !fields.length) return trips;
  return trips.filter((trip) => {
    if (fields.length && !trip.flights.some((flight) => fields.every((field) => fieldMatch(flight, field)))) return false;
    let hay = tripIndex.get(trip);
    if (hay === undefined) {
      hay = [...trip.flights.map(haystack), trip.start, trip.end].join("|");
      tripIndex.set(trip, hay);
    }
    return tokens.every((token) => hay!.includes(token));
  });
}
