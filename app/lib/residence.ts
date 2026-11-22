import { compareText, type Flight } from "./data";
import { angularDistance } from "./geo";
import { metroOf, positionOf } from "./places";

// Where someone lives, read from where they spend their nights rather than
// from which airports they pass through most.
//
// Between two flights the traveller is wherever the first one landed, as long
// as the next one leaves from there or from somewhere near (Hong Kong and
// Shenzhen are one place to live). Home at any moment is the place that
// explains the most nights, and it changes only when a run of nights
// elsewhere outweighs the cost of moving: a long holiday stays a trip, a
// season abroad becomes a home of its own, and a move shows on the day of
// the flight that made it.

const DAY = 86_400_000;
const EARTH_KM = 6371;
// Two airports this close are one place to live: a train or a bridge apart.
const NEAR_KM = 160;
// The price of a move, in nights away from home. Staying somewhere becomes a
// home only past about twice this many nights, five months or so: a summer
// back with family stays a trip, half a year abroad does not.
const MOVE_NIGHTS = 75;
// A stretch between two far-apart airports longer than this says nothing
// about where the nights were spent: a gap in the record, not a stay.
const SILENT_NIGHTS = 120;
// The first flight usually leaves from home, lived in for a while before the
// record begins: worth most of a move, so a record that starts at home and
// soon moves keeps that first home. The traveller is presumably still where
// the last flight landed, but a few weeks of that never make a move alone.
const BEFORE_NIGHTS = 60;
const AFTER_NIGHTS = 30;
// A place counts as a possible home only after this many nights there.
const HOME_NIGHTS = 30;

export const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY;
export const arrivalDay = (flight: Flight) => dayOf(flight.date) + (flight.arrivalDayOffset ?? 0);
export const byTime = (a: Flight, b: Flight) => a.date.localeCompare(b.date) || a.depart.localeCompare(b.depart) || a.id.localeCompare(b.id);

export function kmBetween(a: string, b: string) {
  const from = positionOf(a), to = positionOf(b);
  return from && to ? angularDistance(from, to) * EARTH_KM : Infinity;
}

// Same metro, or close enough to live in one and fly from the other.
export const near = (a: string, b: string) => a === b || metroOf(a) === metroOf(b) || kmBetween(a, b) <= NEAR_KM;

// Nights between two flights: where they were spent (one place, two when the
// next flight leaves from elsewhere, none when the record is silent).
type Stretch = { at: string[]; nights: number };

export type Home = { code: string; from: string; to: string | null; nights: number };

export type Residence = {
  // Flights in the order they flew.
  flights: Flight[];
  // Home just before and just after each flight, as an airport code.
  before: string[];
  after: string[];
  // Each home in turn, with the first and last day it held and its nights.
  homes: Home[];
};

const cache = new WeakMap<Flight[], Residence>();

export function residenceOf(archive: Flight[]): Residence {
  const cached = cache.get(archive);
  if (cached) return cached;
  const flights = [...archive].sort(byTime);
  if (!flights.length) {
    const empty: Residence = { flights, before: [], after: [], homes: [] };
    cache.set(archive, empty);
    return empty;
  }
  // stretches[i] is the time before flights[i]; the last one follows the last flight.
  const stretches: Stretch[] = [{ at: [flights[0].origin], nights: BEFORE_NIGHTS }];
  flights.forEach((flight, index) => {
    const next = flights[index + 1];
    if (!next) { stretches.push({ at: [flight.destination], nights: AFTER_NIGHTS }); return; }
    const nights = Math.max(0, dayOf(next.date) - arrivalDay(flight));
    if (near(flight.destination, next.origin)) stretches.push({ at: [flight.destination], nights });
    else stretches.push({ at: nights > SILENT_NIGHTS ? [] : [flight.destination, next.origin], nights });
  });

  // Places that could be home, each named by the airport with the most nights there.
  const nightsAt = new Map<string, number>();
  for (const stretch of stretches) for (const code of stretch.at) nightsAt.set(code, (nightsAt.get(code) ?? 0) + stretch.nights / stretch.at.length);
  const ranked = [...nightsAt.entries()].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]));
  const candidates: string[] = [];
  for (const [code, nights] of ranked) {
    if (nights < HOME_NIGHTS && code !== flights[0].origin) continue;
    if (!candidates.some((home) => near(home, code))) candidates.push(code);
  }
  if (!candidates.length) candidates.push(flights[0].origin);

  // Cheapest sequence of homes: every night spent away costs one, every move costs MOVE_NIGHTS.
  const away = (home: string, stretch: Stretch) => stretch.at.length ? stretch.nights * stretch.at.filter((code) => !near(code, home)).length / stretch.at.length : 0;
  const size = candidates.length;
  let cost = candidates.map((home) => away(home, stretches[0]));
  const from: number[][] = [];
  for (let index = 1; index < stretches.length; index++) {
    const best = cost.reduce((pick, value, state) => value < cost[pick] ? state : pick, 0);
    const step: number[] = [];
    const next = new Array<number>(size);
    for (let state = 0; state < size; state++) {
      // Staying wins ties, so a home changes only when moving is strictly cheaper.
      const moved = cost[best] + MOVE_NIGHTS;
      const stay = cost[state];
      step.push(stay <= moved ? state : best);
      next[state] = Math.min(stay, moved) + away(candidates[state], stretches[index]);
    }
    from.push(step);
    cost = next;
  }
  const states = new Array<number>(stretches.length);
  states[stretches.length - 1] = cost.reduce((pick, value, state) => value < cost[pick] ? state : pick, 0);
  for (let index = stretches.length - 1; index > 0; index--) states[index - 1] = from[index - 1][states[index]];

  const home = states.map((state) => candidates[state]);
  const before = flights.map((_, index) => home[index]);
  const after = flights.map((_, index) => home[index + 1]);
  const homes: Home[] = [];
  home.forEach((code, index) => {
    const nights = stretches[index].at.some((place) => near(place, code)) ? stretches[index].nights : 0;
    const current = homes.at(-1);
    if (current && current.code === code) { current.nights += nights; return; }
    // A home begins with the flight that moved there, or with the record.
    const day = index === 0 ? flights[0].date : flights[index - 1].date;
    if (current) current.to = day;
    homes.push({ code, from: day, to: null, nights });
  });
  const result: Residence = { flights, before, after, homes };
  cache.set(archive, result);
  return result;
}

// The home on a given day, as an airport code.
export function homeOn(archive: Flight[], date: string) {
  const { homes } = residenceOf(archive);
  return [...homes].reverse().find((home) => home.from <= date)?.code ?? homes[0]?.code ?? "";
}

export const isHomeOn = (archive: Flight[], date: string, code: string) => {
  const home = homeOn(archive, date);
  return !!home && near(home, code);
};

// Where they lived longest: the yardstick for "how far from home".
export function mainHome(archive: Flight[]) {
  const totals = new Map<string, number>();
  for (const home of residenceOf(archive).homes) totals.set(home.code, (totals.get(home.code) ?? 0) + home.nights);
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))[0]?.[0] ?? "";
}

// Every place that was home at some point, so it never counts as somewhere they went.
export const wasHome = (archive: Flight[], code: string) => residenceOf(archive).homes.some((home) => near(home.code, code));
