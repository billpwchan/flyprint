import { airport } from "./gazetteer";
import { isClock, zonedInstant } from "./time";

type Timed = { date: string; origin: string; destination: string; depart: string; arrive: string; arrivalDayOffset: number; durationMinutes: number };

const DAY = 86_400_000;

// Only the server knows each airport's zone, so it fixes the take-off instant.
export function departureOf(flight: Timed) {
  const tz = airport(flight.origin)?.tz;
  return tz && isClock(flight.depart) ? zonedInstant(flight.date, flight.depart, tz) : undefined;
}

// The landing instant: from the arrival time where it is known and after the
// take-off, else from the take-off and the flight time, else the end of the
// day it flew (a day later when no zone is known, so it is never too early).
export function landingOf(flight: Timed, departAt = departureOf(flight)) {
  const arrivalZone = airport(flight.destination)?.tz;
  if (arrivalZone && isClock(flight.arrive)) {
    const at = zonedInstant(flight.date, flight.arrive, arrivalZone, flight.arrivalDayOffset);
    if (departAt === undefined || at > departAt) return at;
  }
  if (departAt !== undefined) return departAt + (flight.durationMinutes || 60) * 60_000;
  const zone = airport(flight.origin)?.tz ?? arrivalZone;
  return zone ? zonedInstant(flight.date, "23:59", zone, flight.arrivalDayOffset) : Date.parse(`${flight.date}T23:59:00Z`) + (1 + flight.arrivalDayOffset) * DAY;
}
