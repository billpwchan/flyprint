import type { Aircraft, FlightOperation, TimeSource } from "../data";
import { carrierAliases, splitFlightNumber } from "./gazetteer";
import { metroOf } from "../places";

// A flight as stored for one person; the archive adds who flew it.
export type FlightRecord = {
  id: string; date: string; flight: string; airline: string; origin: string; destination: string;
  depart: string; arrive: string; arrivalDayOffset: number; durationMinutes: number; timeSource: TimeSource;
  km: number; seat: string; cabin: string; aircraft?: Aircraft; operation?: FlightOperation;
};

// The archive format of earlier releases (and of docs/flight-archive.schema.json):
// carriers named in Chinese, travellers as B and Z on each flight.
type LegacyFlight = Omit<FlightRecord, "seat" | "cabin" | "airline"> & { airline: string; travellerId?: string; travellerIds?: string[]; seat?: string; cabin?: string };
export type LegacyArchive = { travellers?: { id: string; label: string }[]; flights: LegacyFlight[] };

export function carrierCodeFor(name: string, flightNumber: string) {
  if (/^[A-Z0-9]{2,3}$/.test(name)) return name;
  return carrierAliases[name] ?? splitFlightNumber(flightNumber)?.[0] ?? "";
}

export function legacyRecord(flight: LegacyFlight): FlightRecord {
  const record: FlightRecord = {
    id: flight.id, date: flight.date, flight: flight.flight, airline: carrierCodeFor(flight.airline, flight.flight),
    origin: flight.origin, destination: flight.destination, depart: flight.depart ?? "", arrive: flight.arrive ?? "",
    arrivalDayOffset: flight.arrivalDayOffset ?? 0, durationMinutes: flight.durationMinutes ?? 0, timeSource: flight.timeSource ?? "recorded",
    km: flight.km, seat: flight.seat ?? "", cabin: flight.cabin ?? "",
  };
  if (flight.aircraft) record.aircraft = flight.aircraft;
  if (flight.operation) record.operation = { ...flight.operation, airline: carrierCodeFor(flight.operation.airline, flight.operation.flight) };
  return record;
}

export const travellersOf = (flight: LegacyFlight) => flight.travellerIds?.length ? flight.travellerIds : [flight.travellerId ?? "B"];

type Identity = Pick<FlightRecord, "date" | "flight" | "origin" | "destination">;

// One flight in two records: the same day, between the same cities, with the
// same number or a number missing on one side. Imports skip a flight already
// logged by this rule, and two linked people flew together by it.
export const sameFlight = (a: Identity, b: Identity) =>
  a.date === b.date && metroOf(a.origin) === metroOf(b.origin) && metroOf(a.destination) === metroOf(b.destination)
  && (!a.flight || !b.flight || a.flight === b.flight);
