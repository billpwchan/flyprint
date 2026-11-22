import type { Flight } from "./data";
import { aircraftType } from "./aircraft/catalog";
import { countryOf, metroOf } from "./places";

// Flights still ahead: booked, boarding or in the air. A flight counts as
// flown the moment it lands; until then it stays out of every count.

export type Clock = { now: number; today: string };

export const hasLanded = (flight: Flight, now: number) => flight.arriveAt === undefined || flight.arriveAt <= now;
export const isAirborne = (flight: Flight, now: number) => !hasLanded(flight, now) && flight.departAt !== undefined && flight.departAt <= now;

const soonestFirst = (a: Flight, b: Flight) => (a.departAt ?? a.arriveAt ?? 0) - (b.departAt ?? b.arriveAt ?? 0) || a.date.localeCompare(b.date) || a.depart.localeCompare(b.depart);

// The landed flights keep the archive's own array when nothing is ahead, so
// whatever is worked out per archive stays worked out.
export function splitFlights(flights: Flight[], now: number) {
  const ahead = flights.filter((flight) => !hasLanded(flight, now)).sort(soonestFirst);
  return { landed: ahead.length ? flights.filter((flight) => hasLanded(flight, now)) : flights, ahead };
}

// The share of the flight behind it: 0 on the ground before, 1 once landed.
export function progressOf(flight: Flight, now: number) {
  if (hasLanded(flight, now)) return 1;
  if (flight.departAt === undefined || now < flight.departAt) return 0;
  return Math.min(1, (now - flight.departAt) / Math.max(60_000, flight.arriveAt! - flight.departAt));
}

const oldestFirst = (a: Flight, b: Flight) => a.date.localeCompare(b.date) || a.depart.localeCompare(b.depart) || a.id.localeCompare(b.id);
const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const arrivalDay = (flight: Flight) => addDays(flight.date, flight.arrivalDayOffset ?? 0);

export type Together =
  | { kind: "flight"; date: string; flight: Flight }
  // date: the day the second of the two lands.
  | { kind: "meet"; date: string; metro: string; mine: Flight; theirs: Flight };

// The next time two linked people are together, from a page that has both
// sides' flights: a flight they both booked, or each landing in one city,
// away from either one's home, while the other is still there.
export function nextTogether(flights: Flight[], clock: Clock, isHome: (code: string, date: string) => boolean): Together | null {
  const shared = flights.filter((flight) => flight.side === "both" && !hasLanded(flight, clock.now)).sort(soonestFirst)[0];
  let best: Together | null = shared ? { kind: "flight", date: shared.date, flight: shared } : null;
  const sideOf = (side: "me" | "them") => flights.filter((flight) => flight.side === side || flight.side === "both").sort(oldestFirst);
  const mine = sideOf("me"), theirs = sideOf("them");
  // Each landing away, with the day it ends: the next flight, from wherever it
  // leaves (a trip may go on by land); after the last one, a few weeks at most.
  const stays = (list: Flight[]) => list.flatMap((flight, index) => {
    const metro = metroOf(flight.destination);
    const until = list[index + 1]?.date ?? addDays(arrivalDay(flight), 45);
    return flight.side === "both" || until < clock.today || isHome(flight.destination, arrivalDay(flight)) ? [] : [{ flight, metro, from: arrivalDay(flight), until }];
  });
  const theirStays = stays(theirs);
  for (const a of stays(mine)) {
    for (const b of theirStays) {
      if (a.metro !== b.metro || (hasLanded(a.flight, clock.now) && hasLanded(b.flight, clock.now))) continue;
      const from = a.from > b.from ? a.from : b.from;
      if (from > (a.until < b.until ? a.until : b.until) || (best && best.date <= from)) continue;
      best = { kind: "meet", date: from, metro: a.metro, mine: a.flight, theirs: b.flight };
    }
  }
  return best;
}

// A calendar day in a zone (the reader's own when none is given), as YYYY-MM-DD.
export function dayIn(instant: number, zone?: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
  } catch {
    return new Date(instant).toISOString().slice(0, 10);
  }
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export type Countdown =
  | { kind: "days"; days: number }
  | { kind: "tomorrow" }
  // minutes: until take-off, when its time is known.
  | { kind: "today"; minutes: number | null }
  | { kind: "airborne"; minutes: number; progress: number }
  | { kind: "landed" };

// Days count by the calendar: a flight on the 2nd seen on the 18th is 14 days away, whatever the hour.
export function countdownOf(flight: Flight, clock: Clock): Countdown {
  const { now, today } = clock;
  if (hasLanded(flight, now)) return { kind: "landed" };
  if (isAirborne(flight, now)) return { kind: "airborne", minutes: Math.max(1, Math.round((flight.arriveAt! - now) / 60_000)), progress: progressOf(flight, now) };
  const days = daysBetween(today, flight.date);
  if (days >= 2) return { kind: "days", days };
  if (days === 1) return { kind: "tomorrow" };
  return { kind: "today", minutes: flight.departAt !== undefined ? Math.max(0, Math.round((flight.departAt - now) / 60_000)) : null };
}

export type First =
  | { kind: "country"; code: string }
  | { kind: "city"; code: string }
  | { kind: "airline"; code: string }
  | { kind: "type"; icao: string; name: string }
  | { kind: "farthest" };

// What this flight will do for the first time, measured against every flight
// before it, flown or booked earlier.
export function firstsOf(flight: Flight, before: Flight[]): First[] {
  const countries = new Set<string>(), metros = new Set<string>(), airlines = new Set<string>(), types = new Set<string>();
  let farthest = 0;
  for (const other of before) {
    for (const code of [other.origin, other.destination]) { countries.add(countryOf(code)); metros.add(metroOf(code)); }
    if (other.airline) airlines.add(other.airline);
    if (other.aircraft?.icao) types.add(other.aircraft.icao.toUpperCase());
    farthest = Math.max(farthest, other.km);
  }
  if (!before.length) return [];
  const firsts: First[] = [];
  const country = countryOf(flight.destination);
  if (country && !countries.has(country)) firsts.push({ kind: "country", code: country });
  else if (!metros.has(metroOf(flight.destination))) firsts.push({ kind: "city", code: flight.destination });
  if (flight.airline && !airlines.has(flight.airline)) firsts.push({ kind: "airline", code: flight.airline });
  const icao = flight.aircraft?.icao?.toUpperCase();
  // A type guessed from the route is not worth announcing.
  if (icao && flight.aircraft?.source !== "typical" && !types.has(icao)) firsts.push({ kind: "type", icao, name: aircraftType(icao)?.name ?? flight.aircraft!.model });
  if (flight.km > farthest) firsts.push({ kind: "farthest" });
  return firsts;
}

// Which side of the cabin a seat looks out of, by the usual lettering: A on
// the left; the last letter of the row (F on a single aisle, K on two) on the right.
export function seatSide(seat: string | undefined, body: "widebody" | "narrowbody" | undefined): { side: "left" | "right"; window: boolean } | null {
  const letter = seat?.match(/[A-K]$/i)?.[0].toUpperCase();
  if (!letter || !body) return null;
  if (body === "narrowbody") {
    if ("ABC".includes(letter)) return { side: "left", window: letter === "A" };
    if ("DEF".includes(letter)) return { side: "right", window: letter === "F" };
    return null;
  }
  if ("ABC".includes(letter)) return { side: "left", window: letter === "A" };
  if ("HJK".includes(letter)) return { side: "right", window: letter === "K" };
  return null;
}
