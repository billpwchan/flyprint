import { database, newId, now } from "./db";
import type { FlightRecord } from "./records";

const INSERT = `INSERT INTO flights (user_id, id, date, flight, airline, origin, destination, depart, arrive, arrival_day_offset, duration_minutes, time_source, km, seat, cabin, aircraft, operation, import_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (user_id, id) DO NOTHING`;

export function insertRecords(userId: string, records: FlightRecord[], importId: string | null) {
  const statement = database().prepare(INSERT);
  const time = now();
  let added = 0;
  for (const record of records) {
    const result = statement.run(
      userId, record.id || newId("f_"), record.date, record.flight, record.airline, record.origin, record.destination,
      record.depart, record.arrive, record.arrivalDayOffset, record.durationMinutes, record.timeSource, record.km,
      record.seat, record.cabin, record.aircraft ? JSON.stringify(record.aircraft) : null, record.operation ? JSON.stringify(record.operation) : null,
      importId, time, time,
    );
    added += Number(result.changes);
  }
  return added;
}

export function deleteFlight(userId: string, id: string) {
  return Number(database().prepare("DELETE FROM flights WHERE user_id = ? AND id = ?").run(userId, id).changes) > 0;
}

export function flightCount(userId: string) {
  return (database().prepare("SELECT COUNT(*) AS n FROM flights WHERE user_id = ?").get(userId) as { n: number }).n;
}
