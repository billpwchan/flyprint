import { compareText, type Flight } from "./data";
import { summarize, cityPairs, type Summary } from "./insights";
import { citiesIn, type City } from "./footprint";
import { metroOf } from "./places";
import type { Trip } from "./trips";

export type Month = { month: number; flights: Flight[] };
export type Ranked = { name: string; count: number; flights: Flight[] };

export type YearReport = {
  year: number;
  flights: Flight[];
  summary: Summary;
  cities: number;
  months: Month[];
  busiest: Month | null;
  newCities: City[];
  topPair: { a: string; b: string; count: number; ids: string[] } | null;
  longest: Flight | null;
  airlines: Ranked[];
  aircraft: Ranked[];
  aircraftKnown: number;
  trips: Trip[];
  // Where the year's trips went, most visited first; the year is named by these places.
  destinations: string[];
};

const ascending = (a: Flight, b: Flight) => a.date.localeCompare(b.date) || a.depart.localeCompare(b.depart);

function rank(list: Flight[], key: (flight: Flight) => string | undefined): Ranked[] {
  const groups = new Map<string, Ranked>();
  for (const flight of list) {
    const name = key(flight);
    if (!name) continue;
    const entry = groups.get(name) ?? { name, count: 0, flights: [] };
    entry.count++;
    entry.flights.push(flight);
    groups.set(name, entry);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || compareText(a.name, b.name));
}

// Places a set of trips went to, ordered by how many trips reached them and then by first visit.
export function destinationsOf(trips: Trip[]) {
  const counts = new Map<string, { code: string; count: number; first: string }>();
  for (const trip of [...trips].sort((a, b) => a.start.localeCompare(b.start))) {
    if (trip.kind === "return") continue;
    for (const code of [trip.destination, ...trip.stays]) {
      const metro = metroOf(code);
      const entry = counts.get(metro) ?? { code, count: 0, first: trip.start };
      entry.count++;
      counts.set(metro, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.first.localeCompare(b.first)).map((entry) => entry.code);
}

// `scope` is every flight in view, so "first time" means first in the whole archive, not in the year.
export function yearReport(scope: Flight[], year: number, scopeTrips: Trip[]): YearReport {
  const flights = scope.filter((flight) => flight.year === year).sort(ascending);
  const months: Month[] = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, flights: [] }));
  for (const flight of flights) months[Number(flight.date.slice(5, 7)) - 1].flights.push(flight);
  const busiest = months.reduce<Month | null>((best, month) => !best || month.flights.length > best.flights.length ? month : best, null);
  const everCities = citiesIn(scope);
  const yearCities = citiesIn(flights);
  const newCities = [...yearCities.keys()].map((metro) => everCities.get(metro)!).filter((city) => city.first.startsWith(String(year))).sort((a, b) => a.first.localeCompare(b.first));
  const trips = scopeTrips.filter((trip) => trip.year === year);
  const known = flights.filter((flight) => flight.aircraft?.model);
  const [topPair] = cityPairs(flights);
  return {
    year,
    flights,
    summary: summarize(flights),
    cities: yearCities.size,
    months,
    busiest: busiest && busiest.flights.length > 1 ? busiest : null,
    newCities,
    topPair: topPair && topPair.count > 1 ? topPair : null,
    longest: flights.reduce<Flight | null>((best, flight) => !best || flight.km > best.km ? flight : best, null),
    airlines: rank(flights, (flight) => flight.airline),
    aircraft: rank(known, (flight) => flight.aircraft?.model),
    aircraftKnown: known.length,
    trips,
    destinations: destinationsOf(trips),
  };
}
