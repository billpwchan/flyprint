import type { Flight } from "./data";
import { angularDistance } from "./geo";
import { coordinatesOf } from "./places";
import { arrivalDay, dayOf, near, residenceOf } from "./residence";

// round: from home and back. move: from one home to the next (the flight that
// moved them, and anywhere they stopped on the way). outbound: away with no
// flight home on record. return: a flight home whose way out is not on
// record. oneway: neither end at home, as when a trip began and ended by land.
export type TripKind = "round" | "move" | "outbound" | "return" | "oneway";

// What happened between two legs. connection: on within half a day, not back
// the way it came. stay: longer than that, or a visit that turned back the
// same day. ground: the next flight leaves from another city, reached some other way.
export type GapKind = "connection" | "stay" | "ground";
export type Gap = { at: string; to: string; nights: number; minutes: number | null; kind: GapKind };

export type Trip = {
  id: string;
  flights: Flight[];
  origin: string;
  // Home when the trip began, and when it ended (they differ on a move).
  home: string;
  homeAfter: string;
  // Cities where the trip stayed overnight or longer, in order, never a home.
  stays: string[];
  // Where it spent the most nights; a trip is named after it. On a move, the new home.
  destination: string;
  // What happened after each leg except the last.
  gaps: Gap[];
  start: string;
  end: string;
  nights: number;
  km: number;
  minutes: number;
  kind: TripKind;
  year: number;
};

// Past this many nights between two far-apart airports, the record has a
// hole: the trip ends there and the next flight begins another.
const BREAK_NIGHTS = 30;
const DAY_MINUTES = 1440;
// Past this long on the ground they left the airport: a night in Kunming
// before the morning flight to Lijiang is a stay, an overnight wait for the
// first flight out is still a connection.
const CONNECTION_MINUTES = 12 * 60;

const clockOf = (value: string) => /^\d{2}:\d{2}$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;

// Minutes on the ground, from two local clocks read in the same place.
function groundMinutes(landed: Flight, leaving: Flight) {
  const down = clockOf(landed.arrive), up = clockOf(leaving.depart);
  if (down === null || up === null) return null;
  return (dayOf(leaving.date) - arrivalDay(landed)) * DAY_MINUTES + up - down;
}

function gapBetween(landed: Flight, leaving: Flight): Gap {
  const nights = Math.max(0, Math.round(dayOf(leaving.date) - arrivalDay(landed)));
  const base = { at: landed.destination, to: leaving.origin, nights };
  if (!near(landed.destination, leaving.origin)) return { ...base, minutes: null, kind: "ground" };
  const minutes = groundMinutes(landed, leaving);
  const brief = minutes !== null ? minutes <= CONNECTION_MINUTES : nights === 0;
  const turnsBack = near(leaving.destination, landed.origin);
  return { ...base, minutes: minutes !== null && minutes >= 0 ? minutes : null, kind: brief && !turnsBack ? "connection" : "stay" };
}

const broken = (landed: Flight, leaving: Flight) => !near(landed.destination, leaving.origin) && dayOf(leaving.date) - arrivalDay(landed) > BREAK_NIGHTS;

// A trip leaves home and ends when they are home again: back where they
// started, at a new home, or wherever the record goes quiet.
function chain(archive: Flight[]) {
  const { flights, before, after } = residenceOf(archive);
  const groups: { flights: Flight[]; first: number; last: number }[] = [];
  let current: Flight[] = [];
  let first = 0;
  flights.forEach((flight, index) => {
    if (!current.length) first = index;
    current.push(flight);
    const next = flights[index + 1];
    const closes = !next || near(flight.destination, after[index]) || near(next.origin, before[index + 1]) || broken(flight, next);
    if (closes) { groups.push({ flights: current, first, last: index }); current = []; }
  });
  return { groups, before, after };
}

function describe(group: Flight[], home: string, homeAfter: string): Trip {
  const first = group[0], last = group.at(-1)!;
  const gaps = group.slice(0, -1).map((flight, index) => gapBetween(flight, group[index + 1]));
  const atHome = (code: string) => near(code, home) || near(code, homeAfter);
  // Each place stayed, with its nights (a stretch between two airports is shared).
  const stays: string[] = [];
  const nights = new Map<string, number>();
  const add = (code: string, count: number) => {
    if (atHome(code)) return;
    const known = stays.find((stay) => near(stay, code)) ?? (stays.push(code), code);
    nights.set(known, (nights.get(known) ?? 0) + count);
  };
  gaps.forEach((gap) => {
    if (gap.kind === "connection") return;
    if (gap.kind === "ground") { add(gap.at, gap.nights / 2); add(gap.to, gap.nights / 2); }
    else add(gap.at, gap.nights);
  });
  add(last.destination, 0);
  const startsHome = near(first.origin, home);
  const endsHome = near(last.destination, homeAfter);
  const kind: TripKind = startsHome && endsHome ? (home === homeAfter ? "round" : "move")
    : startsHome ? "outbound"
    : endsHome ? (stays.length ? "oneway" : "return")
    : "oneway";
  // Named after where it spent the most nights; the farthest of those breaks a tie.
  const anchor = coordinatesOf(startsHome ? home : first.origin);
  const far = (code: string) => angularDistance(anchor, coordinatesOf(code));
  const touched = group.map((flight) => flight.destination).filter((code) => !atHome(code));
  const candidates = kind === "move" ? [homeAfter] : stays.length ? stays : touched.length ? touched : [last.destination];
  const weight = (code: string) => nights.get(code) ?? 0;
  const destination = candidates.reduce((best, code) => weight(code) > weight(best) || (weight(code) === weight(best) && far(code) > far(best)) ? code : best, candidates[0]);
  return {
    id: first.id,
    flights: group,
    origin: first.origin,
    home,
    homeAfter,
    stays,
    destination,
    gaps,
    start: first.date,
    end: last.date,
    nights: Math.max(0, Math.round(arrivalDay(last) - dayOf(first.date))),
    km: group.reduce((sum, flight) => sum + flight.km, 0),
    minutes: group.reduce((sum, flight) => sum + (flight.durationMinutes || 0), 0),
    kind,
    year: Number(first.date.slice(0, 4)),
  };
}

// Trips that go somewhere, as opposed to a lone flight home.
export const isAway = (trip: Trip) => trip.kind !== "return";

// The trips in one person's archive, newest first.
const tripCache = new WeakMap<Flight[], Trip[]>();
export function buildTrips(archive: Flight[]): Trip[] {
  let trips = tripCache.get(archive);
  if (trips) return trips;
  const { groups, before, after } = chain(archive);
  trips = groups.map((group) => describe(group.flights, before[group.first], after[group.last]))
    .sort((a, b) => b.start.localeCompare(a.start) || b.end.localeCompare(a.end) || a.id.localeCompare(b.id));
  tripCache.set(archive, trips);
  return trips;
}

// A trip is named by its first flight. Addresses from the two-traveller
// releases carried who flew it in front ("B-", "BZ-", "T-").
export function findTrip(archive: Flight[], id: string) {
  const trips = buildTrips(archive);
  return trips.find((trip) => trip.id === id) ?? trips.find((trip) => trip.id === id.replace(/^(?:B|Z|BZ|T)-/, "")) ?? null;
}

// The trip a flight belongs to.
export const tripOf = (archive: Flight[], flightId: string) => buildTrips(archive).find((trip) => trip.flights.some((flight) => flight.id === flightId)) ?? null;

// The people who flew with the reader on a trip, by how many of its flights they shared.
export function companionsOf(trip: Trip) {
  const counts = new Map<string, number>();
  for (const flight of trip.flights) for (const id of flight.with ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count }));
}
