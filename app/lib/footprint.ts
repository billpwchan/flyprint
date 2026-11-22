import { compareText, type Flight } from "./data";
import { countryOf, metroOf } from "./places";

export type City = {
  metro: string;
  // The airport this city is most often reached through; it names and places the city.
  code: string;
  airports: Map<string, number>;
  country: string;
  arrivals: number;
  departures: number;
  flights: Flight[];
  first: string;
  last: string;
};

export type Country = { iso: string; cities: City[]; arrivals: number; flights: Flight[]; first: string };

export type Connection = { metro: string; code: string; count: number; flights: Flight[] };

const byDate = (a: Flight, b: Flight) => a.date.localeCompare(b.date) || a.depart.localeCompare(b.depart);

export function citiesIn(list: Flight[]): Map<string, City> {
  const cities = new Map<string, City>();
  const touch = (code: string, flight: Flight, arriving: boolean) => {
    const metro = metroOf(code);
    let city = cities.get(metro);
    if (!city) {
      city = { metro, code, airports: new Map(), country: countryOf(code), arrivals: 0, departures: 0, flights: [], first: flight.date, last: flight.date };
      cities.set(metro, city);
    }
    city.airports.set(code, (city.airports.get(code) ?? 0) + 1);
    if (arriving) city.arrivals++; else city.departures++;
    if (city.flights.at(-1) !== flight) city.flights.push(flight);
    if (flight.date < city.first) city.first = flight.date;
    if (flight.date > city.last) city.last = flight.date;
  };
  for (const flight of [...list].sort(byDate)) { touch(flight.origin, flight, false); touch(flight.destination, flight, true); }
  for (const city of cities.values()) city.code = [...city.airports.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return cities;
}

const rankCities = (a: City, b: City) => b.arrivals - a.arrivals || a.first.localeCompare(b.first);

export function countriesIn(list: Flight[]): Country[] {
  const countries = new Map<string, Country>();
  for (const city of citiesIn(list).values()) {
    const country = countries.get(city.country) ?? { iso: city.country, cities: [], arrivals: 0, flights: [], first: city.first };
    country.cities.push(city);
    country.arrivals += city.arrivals;
    if (city.first < country.first) country.first = city.first;
    countries.set(city.country, country);
  }
  for (const country of countries.values()) {
    country.cities.sort(rankCities);
    country.flights = [...new Set(country.cities.flatMap((city) => city.flights))];
  }
  return [...countries.values()].sort((a, b) => b.arrivals - a.arrivals || a.first.localeCompare(b.first));
}

// How many cities were reached for the first time in each year, oldest first.
export function newCitiesByYear(list: Flight[]) {
  const counts = new Map<number, City[]>();
  for (const city of citiesIn(list).values()) {
    const year = Number(city.first.slice(0, 4));
    counts.set(year, [...(counts.get(year) ?? []), city]);
  }
  if (!counts.size) return [];
  const years = [...counts.keys()];
  const result: { year: number; cities: City[] }[] = [];
  for (let year = Math.min(...years); year <= Math.max(...years); year++) result.push({ year, cities: counts.get(year) ?? [] });
  return result;
}

export function connectionsOf(list: Flight[], metro: string): Connection[] {
  const groups = new Map<string, Connection>();
  for (const flight of list) {
    const from = metroOf(flight.origin), to = metroOf(flight.destination);
    if (from !== metro && to !== metro) continue;
    const other = from === metro ? flight.destination : flight.origin;
    const key = metroOf(other);
    const entry = groups.get(key) ?? { metro: key, code: other, count: 0, flights: [] };
    entry.count++;
    entry.flights.push(flight);
    groups.set(key, entry);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || compareText(a.code, b.code));
}
