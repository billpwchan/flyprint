import { airport, airportCode, distanceKm, splitFlightNumber } from "../gazetteer";
import { arrivalOffset, estimatedMinutes, flightMinutes, isClock } from "../time";
import { carrierCodeFor, sameFlight, type FlightRecord } from "../records";
import { metroOf } from "../../places";
import { newId } from "../db";
import { landingOf } from "../landing";
import { aircraftFor } from "./aircraft";
import { cabinOf } from "./formats";
import { daysBetween, isDay, parseClock, parseDay, today } from "./dates";
import type { Candidate, Change, DraftRow, Fields, Problem } from "./types";

// A candidate to a row the reader can check: codes resolved, the flight
// number in one spelling, the day of arrival and the time in the air worked
// out, and whether the log already has it.

export type Existing = { id: string; date: string; flight: string; origin: string; destination: string; depart: string; arrive: string; arrivalDayOffset: number; durationMinutes: number; seat: string; cabin: string };

// Times and seat a newer itinerary gives differently; a field it leaves blank
// changes nothing, and times count only as a pair, so the flight time follows.
function changesOf(fields: Fields, logged: Existing): Change[] {
  const changes: Change[] = [];
  const timed = isClock(fields.depart) && isClock(fields.arrive);
  for (const field of timed ? ["depart", "arrive", "seat", "cabin"] as const : ["seat", "cabin"] as const) {
    const to = fields[field], from = logged[field] ?? "";
    if (to && to !== from) changes.push({ field, from, to });
  }
  return changes;
}
export type Carriers = Map<string, string>; // ICAO designator → IATA

const BLOCKING: Problem[] = ["date", "origin", "destination", "same_airport"];

export function flightNumber(flight: string, airline: string, carriers: Carriers) {
  const raw = flight.toUpperCase().replace(/[\s-]+/g, "");
  let parts = splitFlightNumber(raw);
  if (!parts && /^\d{1,4}[A-Z]?$/.test(raw)) {
    const code = carrierCodeFor(airline.trim(), "");
    if (code) parts = [code, raw.replace(/^0+/, "")];
  }
  if (!parts) return { flight: raw, airline: carrierCodeFor(airline.trim(), raw) };
  const designator = parts[0].length === 3 ? carriers.get(parts[0]) || parts[0] : parts[0];
  return { flight: `${designator}${parts[1]}`, airline: designator };
}

type Identity = Pick<Fields, "date" | "flight" | "origin" | "destination">;

// Whether a flight is one already logged. People upload their whole history
// again and again, so this decides what is never written twice.
// Sure: the same day and route (by city, so PEK and PKX agree) and the same
// number, or no number on one side. Likely, and left for the reader to
// decide: the same day and route under another number (a codeshare, or a
// rebooking), the same day and number on another route (a misread airport,
// or the second leg of a through flight), or the same flight a day apart
// (a red-eye dated by another clock).
export function matchOf(row: Identity, existing: Identity[]): { index: number; likely: boolean } | null {
  let likely = -1;
  for (let index = 0; index < existing.length; index++) {
    const other = existing[index];
    const sameRoute = metroOf(row.origin) === metroOf(other.origin) && metroOf(row.destination) === metroOf(other.destination);
    const sameNumber = !!row.flight && row.flight === other.flight;
    if (sameFlight(row, other)) return { index, likely: false };
    if (other.date === row.date) {
      if (likely < 0 && (sameRoute || sameNumber)) likely = index;
    } else if (likely < 0 && sameRoute && sameNumber && isDay(row.date) && isDay(other.date) && Math.abs(daysBetween(row.date, other.date)) === 1) {
      likely = index;
    }
  }
  return likely >= 0 ? { index: likely, likely: true } : null;
}

export function normalize(candidate: Candidate, existing: Existing[], carriers: Carriers): DraftRow {
  const origin = airportCode(candidate.origin) ?? "";
  const destination = airportCode(candidate.destination) ?? "";
  const number = flightNumber(candidate.flight, candidate.airline, carriers);
  const fields: Fields = {
    date: isDay(candidate.date) ? candidate.date : parseDay(candidate.date),
    flight: number.flight,
    origin: origin || candidate.origin.trim().slice(0, 40),
    destination: destination || candidate.destination.trim().slice(0, 40),
    depart: isClock(candidate.depart) ? candidate.depart : parseClock(candidate.depart),
    arrive: isClock(candidate.arrive) ? candidate.arrive : parseClock(candidate.arrive),
    seat: candidate.seat.trim().toUpperCase().slice(0, 6),
    cabin: cabinOf(candidate.cabin),
  };
  return measure({
    key: newId("r", 8),
    include: true,
    state: "new",
    problems: [],
    fields,
    candidate,
    airline: number.airline,
    km: 0, durationMinutes: 0, arrivalDayOffset: 0, timeSource: "estimated",
    sources: [candidate.source],
    sure: candidate.sure,
    upcoming: false,
    duplicateOf: null,
  }, existing, carriers);
}

// Everything that follows from the fields; run again after the reader edits them.
export function measure(row: DraftRow, existing: Existing[], carriers: Carriers): DraftRow {
  const { fields } = row;
  const number = flightNumber(fields.flight, row.airline || row.candidate.airline, carriers);
  fields.flight = number.flight;
  row.airline = number.airline;
  const from = airport(fields.origin), to = airport(fields.destination);
  const problems: Problem[] = [];
  if (!isDay(fields.date) || daysBetween(today(), fields.date) > 400) problems.push("date");
  if (!from) problems.push("origin");
  if (!to) problems.push("destination");
  if (from && to && from.code === to.code) problems.push("same_airport");
  row.km = from && to ? distanceKm(from.coordinates, to.coordinates) : 0;
  const arrivalDay = isDay(row.candidate.arrivalDate) && isDay(fields.date) ? daysBetween(fields.date, row.candidate.arrivalDate) : null;
  row.arrivalDayOffset = 0;
  row.durationMinutes = row.km ? estimatedMinutes(row.km) : 0;
  row.timeSource = "estimated";
  if (from && to && isClock(fields.depart) && isClock(fields.arrive) && isDay(fields.date)) {
    const offset = arrivalDay !== null && arrivalDay >= -1 && arrivalDay <= 2 ? arrivalDay : arrivalOffset(fields.date, fields.depart, fields.arrive, from.tz, to.tz, row.km);
    const minutes = flightMinutes(fields.date, fields.depart, fields.arrive, offset, from.tz, to.tz);
    // Times that give no believable flight stay visible but do not set the duration.
    if (minutes && minutes > row.km / 1100 * 60 && minutes < row.km / 300 * 60 + 150) {
      row.arrivalDayOffset = offset;
      row.durationMinutes = minutes;
      row.timeSource = "recorded";
    } else problems.push("time");
  }
  row.problems = problems;
  row.upcoming = isDay(fields.date) && fields.date > today();
  const match = matchOf(fields, existing);
  row.duplicateOf = match ? existing[match.index].id : null;
  row.likely = !!match?.likely;
  // Only a flight surely the same, under the same number, and not yet landed
  // follows a newer itinerary: flown ones are history, and a probable match or
  // one without a number to go by is the reader's call.
  const sure = match && !match.likely ? existing[match.index] : null;
  const logged = sure && fields.flight && sure.flight === fields.flight ? sure : null;
  const ahead = !!logged && landingOf(logged) > Date.now();
  const cancelled = row.candidate.status === "cancelled";
  row.changes = ahead && !cancelled ? changesOf(fields, logged) : [];
  const blocked = problems.some((problem) => BLOCKING.includes(problem));
  row.state = blocked ? "problem"
    : cancelled ? (ahead ? "remove" : "cancelled")
    : row.duplicateOf ? (row.changes.length ? "update" : "duplicate")
    : "new";
  return row;
}

// A cancelled booking and its rebooking arrive together. Rebooked on the same
// flight, the logged flight is kept at its new times rather than removed;
// rebooked on another flight that day (or the next), that flight replaces it.
export function settle(rows: DraftRow[], initial = true) {
  const kept = new Set(rows.filter((row) => row.duplicateOf && !row.likely && (row.state === "update" || row.state === "duplicate")).map((row) => row.duplicateOf));
  for (const row of rows) if (row.state === "remove" && kept.has(row.duplicateOf)) { row.state = "cancelled"; row.include = false; }
  // One logged flight takes one change; a second row aimed at it is the reader's call.
  const aimed = new Set<string>();
  for (const row of rows) {
    if ((row.state !== "update" && row.state !== "remove") || !row.duplicateOf) continue;
    if (!aimed.has(row.duplicateOf)) { aimed.add(row.duplicateOf); continue; }
    row.state = "duplicate";
    row.likely = true;
    row.changes = [];
    row.include = false;
  }
  const replaced = new Set(rows.filter((row) => row.state === "remove").map((row) => row.duplicateOf));
  for (const row of rows) if (row.state === "duplicate" && row.likely && replaced.has(row.duplicateOf)) { row.state = "new"; if (initial) row.include = true; }
  return rows;
}

// One flight read from two places (a screenshot and a spreadsheet, two
// overlapping screenshots) becomes one row with what each knew.
export function mergeRows(rows: DraftRow[], existing: Existing[], carriers: Carriers): DraftRow[] {
  const merged: DraftRow[] = [];
  for (const row of rows) {
    // Only a sure match is merged, and never a cancelled booking into the
    // flight that replaced it.
    const match = row.fields.date ? matchOf(row.fields, merged.map((other) => other.fields)) : null;
    const twin = match && !match.likely ? merged[match.index] : null;
    if (!twin || (twin.candidate.status === "cancelled") !== (row.candidate.status === "cancelled")) { merged.push(row); continue; }
    for (const field of Object.keys(twin.fields) as (keyof Fields)[]) if (!twin.fields[field] && row.fields[field]) twin.fields[field] = row.fields[field];
    for (const field of ["arrivalDate", "aircraft", "registration", "passenger", "airline"] as const) if (!twin.candidate[field] && row.candidate[field]) twin.candidate[field] = row.candidate[field];
    if (twin.candidate.status === "unknown") twin.candidate.status = row.candidate.status;
    twin.sources = [...new Set([...twin.sources, ...row.sources])];
    twin.sure = twin.sure && row.sure;
    measure(twin, existing, carriers);
  }
  // Rows that can be saved first, then the ones that need a look; newest first within each.
  const rank = { new: 0, update: 1, remove: 2, duplicate: 3, cancelled: 4, problem: 5 } as const;
  return settle(merged.map((row) => ({ ...row, include: row.state === "new" || row.state === "update" || row.state === "remove" })))
    .sort((a, b) => rank[a.state] - rank[b.state] || b.fields.date.localeCompare(a.fields.date) || a.fields.depart.localeCompare(b.fields.depart));
}

export function recordOf(row: DraftRow): FlightRecord {
  const aircraft = aircraftFor(row.candidate.aircraft, row.candidate.registration, true);
  const record: FlightRecord = {
    id: newId("f_"),
    date: row.fields.date,
    flight: row.fields.flight,
    airline: row.airline,
    origin: row.fields.origin,
    destination: row.fields.destination,
    depart: row.fields.depart,
    arrive: row.fields.arrive,
    arrivalDayOffset: row.arrivalDayOffset,
    durationMinutes: row.durationMinutes,
    timeSource: row.timeSource,
    km: row.km,
    seat: row.fields.seat,
    cabin: row.fields.cabin,
  };
  if (aircraft) record.aircraft = aircraft;
  return record;
}
