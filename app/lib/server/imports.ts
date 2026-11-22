import { database, newId, now, transaction, whenOpened } from "./db";
import { insertRecords } from "./flights";
import { matchOf, type Existing } from "./import/normalize";
import type { Change, DraftRow, Fields, SourceReport } from "./import/types";

// An import is a draft until the reader saves it; saved, its flights carry
// its id, so the whole import can be taken back.

export type ImportStatus = "reading" | "ready" | "failed" | "saved" | "undone" | "discarded";
export type Progress = { stage: "reading" | "extracting" | "naming" | "checking"; done: number; total: number };
export type ImportSummary = { id: string; createdAt: number; status: ImportStatus; sources: SourceReport[]; added: number; updated: number; removed: number; error: string | null };

// A saved import keeps the flights it changed or removed as they were, so taking it back restores them.
type FlightRow = { id: string; date: string; flight: string; origin: string; destination: string; import_id: string | null; depart: string; arrive: string; arrival_day_offset: number; duration_minutes: number; time_source: string; seat: string; cabin: string } & Record<string, unknown>;
// after: what the update wrote, so undo takes back only what is still its own.
type Undo = { updated: { before: FlightRow; after: FlightRow }[]; removed: FlightRow[] };
const REVERTIBLE = ["depart", "arrive", "arrival_day_offset", "duration_minutes", "time_source", "seat", "cabin"] as const;
// The times and what follows from them go back together or not at all.
const GROUPS: (readonly (typeof REVERTIBLE)[number][])[] = [["depart", "arrive", "arrival_day_offset", "duration_minutes", "time_source"], ["seat"], ["cabin"]];

// The reader's flights as the importer compares against them.
export const existingOf = (userId: string) => database()
  .prepare("SELECT id, date, flight, origin, destination, depart, arrive, arrival_day_offset AS arrivalDayOffset, duration_minutes AS durationMinutes, seat, cabin FROM flights WHERE user_id = ?")
  .all(userId) as Existing[];
type Meta = { sources: SourceReport[]; error?: string | null; undo?: Undo };

const progress = new Map<string, Progress>();
export const setProgress = (id: string, value: Progress) => progress.set(id, value);

type Row = { id: string; user_id: string; created_at: number; status: ImportStatus; sources: string; draft: string | null; added: number };
const summaryOf = (row: Row): ImportSummary => {
  const meta = JSON.parse(row.sources) as Meta;
  return { id: row.id, createdAt: row.created_at, status: row.status, sources: meta.sources, added: row.added, updated: meta.undo?.updated.length ?? 0, removed: meta.undo?.removed.length ?? 0, error: meta.error ?? null };
};

// An import the server was reading when it stopped will never finish.
whenOpened(() => {
  database().prepare("UPDATE imports SET status = 'failed', sources = json_set(sources, '$.error', 'interrupted') WHERE status = 'reading'").run();
});

export function startImport(userId: string, sources: SourceReport[]) {
  const id = newId("i_");
  database().prepare("INSERT INTO imports (id, user_id, created_at, status, sources, draft, added) VALUES (?, ?, ?, 'reading', ?, NULL, 0)").run(id, userId, now(), JSON.stringify({ sources }));
  progress.set(id, { stage: "reading", done: 0, total: sources.length });
  return id;
}

export const busy = (userId: string) => !!database().prepare("SELECT 1 FROM imports WHERE user_id = ? AND status = 'reading'").get(userId);

export function finishImport(id: string, sources: SourceReport[], rows: DraftRow[]) {
  database().prepare("UPDATE imports SET status = 'ready', sources = ?, draft = ? WHERE id = ? AND status = 'reading'").run(JSON.stringify({ sources }), JSON.stringify(rows), id);
  progress.delete(id);
}

export function failImport(id: string, sources: SourceReport[], error: string) {
  database().prepare("UPDATE imports SET status = 'failed', sources = ? WHERE id = ?").run(JSON.stringify({ sources, error }), id);
  progress.delete(id);
}

function rowOf(userId: string, id: string) {
  return database().prepare("SELECT * FROM imports WHERE id = ? AND user_id = ?").get(id, userId) as Row | undefined;
}

export function importOf(userId: string, id: string) {
  const row = rowOf(userId, id);
  if (!row) return null;
  return { ...summaryOf(row), rows: row.draft ? JSON.parse(row.draft) as DraftRow[] : [], progress: progress.get(id) ?? null };
}

export function importsOf(userId: string, limit = 20): ImportSummary[] {
  const rows = database().prepare("SELECT * FROM imports WHERE user_id = ? AND status NOT IN ('discarded') ORDER BY created_at DESC LIMIT ?").all(userId, limit) as Row[];
  return rows.map(summaryOf);
}

export function draftOf(userId: string, id: string) {
  const row = rowOf(userId, id);
  return row?.status === "ready" && row.draft ? JSON.parse(row.draft) as DraftRow[] : null;
}

export function saveDraft(userId: string, id: string, rows: DraftRow[]) {
  database().prepare("UPDATE imports SET draft = ? WHERE id = ? AND user_id = ? AND status = 'ready'").run(JSON.stringify(rows), id, userId);
}

type Records = Parameters<typeof insertRecords>[1];
export type Update = { id: string; record: Records[number]; changes: Change[] };

export function commitImport(userId: string, id: string, rows: DraftRow[], records: Records, updates: Update[] = [], removals: string[] = []) {
  return transaction((db) => {
    // Two saves at once: only the first finds the draft still ready.
    const claimed = Number(db.prepare("UPDATE imports SET status = 'saved' WHERE id = ? AND user_id = ? AND status = 'ready'").run(id, userId).changes);
    if (!claimed) return null;
    // Checked once more inside the write, against the log and against each other.
    const logged = db.prepare("SELECT date, flight, origin, destination FROM flights WHERE user_id = ?").all(userId) as { date: string; flight: string; origin: string; destination: string }[];
    const fresh: typeof records = [];
    for (const record of records) {
      if (matchOf(record, logged)?.likely === false) continue;
      fresh.push(record);
      logged.push(record);
    }
    const added = insertRecords(userId, fresh, id);
    const undo: Undo = { updated: [], removed: [] };
    const read = db.prepare("SELECT * FROM flights WHERE user_id = ? AND id = ?");
    const write = db.prepare("UPDATE flights SET depart = ?, arrive = ?, arrival_day_offset = ?, duration_minutes = ?, time_source = ?, seat = ?, cabin = ?, updated_at = ? WHERE user_id = ? AND id = ?");
    const touched = new Set<string>();
    for (const { id: flightId, record, changes } of updates) {
      const before = read.get(userId, flightId) as FlightRow | undefined;
      if (!before || touched.has(flightId)) continue;
      touched.add(flightId);
      const changed = new Set(changes.map((change) => change.field));
      const timed = changed.has("depart") || changed.has("arrive");
      write.run(
        timed ? record.depart : before.depart, timed ? record.arrive : before.arrive,
        timed ? record.arrivalDayOffset : before.arrival_day_offset, timed ? record.durationMinutes : before.duration_minutes, timed ? record.timeSource : before.time_source,
        changed.has("seat") ? record.seat : before.seat, changed.has("cabin") ? record.cabin : before.cabin,
        now(), userId, flightId,
      );
      undo.updated.push({ before, after: read.get(userId, flightId) as FlightRow });
    }
    const remove = db.prepare("DELETE FROM flights WHERE user_id = ? AND id = ?");
    for (const flightId of removals) {
      const before = read.get(userId, flightId) as FlightRow | undefined;
      if (!before || touched.has(flightId)) continue;
      touched.add(flightId);
      remove.run(userId, flightId);
      undo.removed.push(before);
    }
    db.prepare("UPDATE imports SET added = ?, draft = ?, sources = json_set(sources, '$.undo', json(?)) WHERE id = ? AND user_id = ?").run(added, JSON.stringify(rows), JSON.stringify(undo), id, userId);
    return { added, updated: undo.updated.length, removed: undo.removed.length };
  });
}

const COLUMNS = ["user_id", "id", "date", "flight", "airline", "origin", "destination", "depart", "arrive", "arrival_day_offset", "duration_minutes", "time_source", "km", "seat", "cabin", "aircraft", "operation", "import_id", "created_at", "updated_at"] as const;

// Takes back a saved import's flights, or drops a draft.
export function withdrawImport(userId: string, id: string) {
  const row = rowOf(userId, id);
  if (!row) return null;
  return transaction((db) => {
    if (row.status === "saved") {
      const removed = Number(db.prepare("DELETE FROM flights WHERE user_id = ? AND import_id = ?").run(userId, id).changes);
      const undo = (JSON.parse(row.sources) as Meta).undo;
      let restored = 0, reverted = 0;
      if (undo) {
        const read = db.prepare("SELECT * FROM flights WHERE user_id = ? AND id = ?");
        const revert = db.prepare("UPDATE flights SET depart = ?, arrive = ?, arrival_day_offset = ?, duration_minutes = ?, time_source = ?, seat = ?, cabin = ?, updated_at = ? WHERE user_id = ? AND id = ?");
        // What another import changed again keeps that value, and that import
        // inherits what came before this one, so undoing it later goes all the way back.
        const others = (db.prepare("SELECT id, sources FROM imports WHERE user_id = ? AND status = 'saved' AND id != ?").all(userId, id) as { id: string; sources: string }[])
          .map((other) => ({ id: other.id, meta: JSON.parse(other.sources) as Meta, dirty: false }));
        const handDown = (flightId: string, group: readonly (typeof REVERTIBLE)[number][], from: FlightRow, to: FlightRow) => {
          for (const other of others) {
            const rows = [...(other.meta.undo?.updated ?? []).map((entry) => entry.before), ...(other.meta.undo?.removed ?? [])];
            for (const held of rows) {
              if (held?.id !== flightId || !group.every((field) => held[field] === from[field])) continue;
              for (const field of group) (held as Record<string, unknown>)[field] = to[field];
              other.dirty = true;
            }
          }
        };
        for (const entry of undo.updated) {
          if (!("after" in entry) || !entry.after) continue;
          const { before, after } = entry;
          const current = read.get(userId, before.id) as FlightRow | undefined;
          const next: Record<string, unknown> = { ...current };
          for (const group of GROUPS) {
            if (current && group.every((field) => current[field] === after[field])) for (const field of group) next[field] = before[field];
            else handDown(before.id, group, after, before);
          }
          if (!current || REVERTIBLE.every((field) => next[field] === current[field])) continue;
          revert.run(...REVERTIBLE.map((field) => next[field] as string | number), now(), userId, before.id);
          reverted++;
        }
        const keep = db.prepare("UPDATE imports SET sources = ? WHERE user_id = ? AND id = ?");
        for (const other of others) if (other.dirty) keep.run(JSON.stringify(other.meta), userId, other.id);
        // A removed flight comes back unless the import that added it was undone
        // since, or the same flight is in the log again.
        const logged = db.prepare("SELECT date, flight, origin, destination FROM flights WHERE user_id = ?").all(userId) as { date: string; flight: string; origin: string; destination: string }[];
        const statusOf = db.prepare("SELECT status FROM imports WHERE user_id = ? AND id = ?");
        const restore = db.prepare(`INSERT INTO flights (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map(() => "?").join(", ")}) ON CONFLICT (user_id, id) DO NOTHING`);
        for (const before of undo.removed) {
          const origin = before.import_id ? (statusOf.get(userId, before.import_id) as { status: string } | undefined)?.status : null;
          if (origin === "undone" || matchOf(before, logged)?.likely === false) continue;
          restored += Number(restore.run(...COLUMNS.map((column) => (before[column] ?? null) as string | number | null)).changes);
          logged.push(before);
        }
      }
      db.prepare("UPDATE imports SET status = 'undone' WHERE id = ?").run(id);
      return { status: "undone" as const, removed, restored, reverted };
    }
    if (row.status === "ready" || row.status === "failed") {
      db.prepare("UPDATE imports SET status = 'discarded', draft = NULL WHERE id = ?").run(id);
      return { status: "discarded" as const, removed: 0 };
    }
    return null;
  });
}

// seen: the state the reader was shown, so the save does only what they saw.
export type Edit = { key: string; include: boolean; fields: Partial<Fields>; seen?: DraftRow["state"] };
