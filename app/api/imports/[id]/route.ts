import { atlasFor } from "../../../lib/server/gazetteer";
import { commitImport, draftOf, existingOf, importOf, withdrawImport, type Edit } from "../../../lib/server/imports";
import { EDITABLE, type DraftRow } from "../../../lib/server/import/types";
import { measure, recordOf, settle, type Existing } from "../../../lib/server/import/normalize";
import { body, fail, json, signedIn } from "../../../lib/server/http";
import type { Flight } from "../../../lib/data";
import { DESIGNATORS } from "../../../lib/server/import/designators";

// Names and positions for every code the draft uses, so the page can show cities.
const atlasOfRows = (rows: DraftRow[]) => atlasFor(rows.map((row) => ({ origin: row.fields.origin, destination: row.fields.destination, airline: row.airline }) as Flight));

export const GET = signedIn(async (_request, user, { params }) => {
  const item = importOf(user.id, (await params).id);
  if (!item) return fail("not_found", 404);
  return json({ ...item, atlas: atlasOfRows(item.rows) });
}, { write: false });

// Every row is measured again against the log as it is now, not as it was
// when the draft was read: another import may have been saved since.
function applyEdits(rows: DraftRow[], byKey: Map<string, Edit>, existing: Existing[]) {
  const drafted = new Map(rows.map((row) => [row.key, row.state]));
  for (const row of rows) {
    const edit = byKey.get(row.key);
    if (!edit) continue;
    for (const field of EDITABLE) {
      const value = edit.fields?.[field];
      if (typeof value !== "string" || value === row.fields[field]) continue;
      row.fields[field] = value.trim().slice(0, 40);
      // The arrival day read with the old date no longer applies.
      if (field === "date") row.candidate.arrivalDate = "";
    }
    for (const field of ["origin", "destination", "flight", "seat"] as const) row.fields[field] = row.fields[field].toUpperCase().replace(/\s+/g, "");
  }
  for (const row of rows) measure(row, existing, DESIGNATORS);
  settle(rows, false);
  for (const row of rows) {
    const edit = byKey.get(row.key);
    if (edit) {
      // A row that has just become logged already or cancelled starts unticked;
      // once the reader has seen it so, their tick stands.
      const seen = edit.seen ?? drafted.get(row.key);
      row.include = !!edit.include && !(seen !== row.state && (row.state === "duplicate" || row.state === "cancelled"));
    }
    if (row.state === "problem") row.include = false;
  }
  return rows;
}

// check: recompute edited rows · save: write the included rows to the log
export const POST = signedIn(async (request, user, { params }) => {
  const id = (await params).id;
  const input = await body<{ action: string; edits: Edit[] }>(request);
  const rows = draftOf(user.id, id);
  if (!rows) return fail("not_ready", 409);
  const edits = Array.isArray(input.edits) ? input.edits.slice(0, 5000) : [];
  const byKey = new Map(edits.map((edit) => [edit.key, edit]));
  const next = applyEdits(rows, byKey, existingOf(user.id));
  if (input.action === "check") return json({ rows: next, atlas: atlasOfRows(next) });
  if (input.action !== "save") return fail("action");
  // The save does only what the reader saw: if another import or the clock
  // changed what a row would do, the rows go back to them first.
  const moved = next.some((row) => { const seen = byKey.get(row.key)?.seen; return !!seen && seen !== row.state && (row.include || !!byKey.get(row.key)?.include); });
  if (moved) return json({ changed: true, rows: next, atlas: atlasOfRows(next) });
  // A sure duplicate is never written, whatever is ticked. A changed or
  // cancelled booking acts on the flight it matched, once.
  const chosen = next.filter((row) => row.include && row.state !== "problem" && !(row.state === "duplicate" && !row.likely));
  const inserts = chosen.filter((row) => row.state !== "update" && row.state !== "remove").map(recordOf);
  const targets = new Set<string>();
  const once = (row: DraftRow) => !!row.duplicateOf && !targets.has(row.duplicateOf) && !!targets.add(row.duplicateOf);
  const updates = chosen.filter((row) => row.state === "update" && once(row)).map((row) => ({ id: row.duplicateOf!, record: recordOf(row), changes: row.changes ?? [] }));
  const removals = chosen.filter((row) => row.state === "remove" && once(row)).map((row) => row.duplicateOf!);
  const result = commitImport(user.id, id, next, inserts, updates, removals);
  return result === null ? fail("not_ready", 409) : json(result);
});

export const DELETE = signedIn(async (_request, user, { params }) => {
  const result = withdrawImport(user.id, (await params).id);
  return result ? json(result) : fail("not_found", 404);
});
