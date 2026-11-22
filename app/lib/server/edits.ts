import { database, now } from "./db";
import { insertRecords } from "./flights";
import { splitFlightNumber } from "./gazetteer";
import { existingOf } from "./imports";
import { aircraftFor } from "./import/aircraft";
import { DESIGNATORS } from "./import/designators";
import { normalize, recordOf } from "./import/normalize";
import { blank, type DraftRow } from "./import/types";
import { text } from "./http";
import { resolveAirport } from "./airportSearch";
import type { Aircraft } from "../data";

// A flight typed in by hand, or a logged one put right. Both are read the way
// an import reads a row, so codes, times and distance come out the same.

export type FlightInput = {
  date?: unknown; flight?: unknown; origin?: unknown; destination?: unknown; depart?: unknown; arrive?: unknown;
  seat?: unknown; cabin?: unknown; aircraft?: unknown; registration?: unknown;
};

type Outcome = { id: string } | { error: string; id?: string };
type Stored = { date: string; flight: string; origin: string; destination: string; depart: string; arrive: string; aircraft: string | null };

const BLOCKING = ["date", "origin", "destination", "same_airport", "time"];

function airportOf(value: unknown, field: "origin" | "destination"): { code: string } | { error: string } {
  const typed = text(value, 40).trim();
  if (!typed) return { error: field };
  const resolved = resolveAirport(typed);
  if ("code" in resolved) return { code: resolved.code };
  return { error: "ambiguous" in resolved ? `${field}_ambiguous` : field };
}

function draftOf(userId: string, input: FlightInput, replacing?: string): DraftRow | { error: string } {
  const origin = airportOf(input.origin, "origin");
  if ("error" in origin) return origin;
  const destination = airportOf(input.destination, "destination");
  if ("error" in destination) return destination;
  const candidate = {
    ...blank("manual"),
    date: text(input.date, 20).trim(), flight: text(input.flight, 12).trim(), origin: origin.code, destination: destination.code,
    depart: text(input.depart, 8).trim(), arrive: text(input.arrive, 8).trim(),
    seat: text(input.seat, 6).trim(), cabin: text(input.cabin, 20).trim(),
  };
  const existing = existingOf(userId).filter((flight) => flight.id !== replacing);
  return normalize(candidate, existing, new Map(DESIGNATORS));
}

// Times already logged that do not fit the route (an import keeps them) do
// not stop a later correction of something else.
function problemOf(row: DraftRow, stored?: Stored): Outcome | null {
  const unchangedTimes = !!stored && stored.depart === row.fields.depart && stored.arrive === row.fields.arrive;
  const problem = row.problems.find((value) => BLOCKING.includes(value) && !(value === "time" && unchangedTimes));
  if (problem) return { error: problem };
  // A number an import kept as it was written (1234, no airline) stands until it is changed.
  if (row.fields.flight && !splitFlightNumber(row.fields.flight) && row.fields.flight !== stored?.flight) return { error: "flight" };
  return null;
}

// Checked after every field reads right, so a clash is the last thing said.
const clashOf = (row: DraftRow): Outcome | null => row.duplicateOf && !row.likely ? { error: "duplicate", id: row.duplicateOf } : null;

// The form shows the aircraft as logged, so what comes back is the whole
// truth: empty removes it, the logged model keeps its source, a new model is
// read like an import reads one. A registration needs a type to ride on.
const TAIL = /^[A-Z0-9]{1,2}-?[A-Z0-9]{2,5}$/;

function aircraftOf(input: FlightInput, known: Aircraft | null): { aircraft: Aircraft | null } | { error: string } {
  const type = text(input.aircraft, 40).trim();
  const registration = text(input.registration, 10).replace(/\s+/g, "").toUpperCase();
  if (registration && !TAIL.test(registration)) return { error: "registration" };
  if (!type) return registration ? { error: "registration_type" } : { aircraft: null };
  if (known && type === known.model) {
    const kept: Aircraft = { ...known };
    delete kept.registration;
    return { aircraft: registration ? { ...kept, registration } : kept };
  }
  const found = aircraftFor(type, registration, true);
  return found ? { aircraft: found } : { error: "aircraft" };
}

export function addFlight(userId: string, input: FlightInput): Outcome {
  const row = draftOf(userId, input);
  if ("error" in row) return row;
  const problem = problemOf(row);
  if (problem) return problem;
  const aircraft = aircraftOf(input, null);
  if ("error" in aircraft) return aircraft;
  const clash = clashOf(row);
  if (clash) return clash;
  const record = recordOf(row);
  if (aircraft.aircraft) record.aircraft = aircraft.aircraft; else delete record.aircraft;
  insertRecords(userId, [record], null);
  return { id: record.id };
}

export function updateFlight(userId: string, id: string, input: FlightInput): Outcome {
  const stored = database().prepare("SELECT date, flight, origin, destination, depart, arrive, aircraft FROM flights WHERE user_id = ? AND id = ?").get(userId, id) as Stored | undefined;
  if (!stored) return { error: "not_found" };
  const row = draftOf(userId, input, id);
  if ("error" in row) return row;
  const problem = problemOf(row, stored);
  if (problem) return problem;
  let known: Aircraft | null = null;
  try { known = stored.aircraft ? JSON.parse(stored.aircraft) as Aircraft : null; } catch { known = null; }
  const aircraft = aircraftOf(input, known);
  if ("error" in aircraft) return aircraft;
  const clash = clashOf(row);
  if (clash) return clash;
  const record = recordOf(row);
  // A codeshare's operating flight belongs to the flight it was read with.
  const moved = record.date !== stored.date || record.flight !== stored.flight || record.origin !== stored.origin || record.destination !== stored.destination;
  // Corrected by hand, the flight is the reader's own: taking back the import
  // it came in with no longer removes it.
  database().prepare(`UPDATE flights SET date = ?, flight = ?, airline = ?, origin = ?, destination = ?, depart = ?, arrive = ?,
      arrival_day_offset = ?, duration_minutes = ?, time_source = ?, km = ?, seat = ?, cabin = ?, aircraft = ?,
      operation = CASE WHEN ? THEN NULL ELSE operation END, import_id = NULL, updated_at = ?
    WHERE user_id = ? AND id = ?`).run(
    record.date, record.flight, record.airline, record.origin, record.destination, record.depart, record.arrive,
    record.arrivalDayOffset, record.durationMinutes, record.timeSource, record.km, record.seat, record.cabin,
    aircraft.aircraft ? JSON.stringify(aircraft.aircraft) : null, moved ? 1 : 0, now(), userId, id,
  );
  return { id };
}
