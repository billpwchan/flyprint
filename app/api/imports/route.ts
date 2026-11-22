import { busy, importsOf, startImport } from "../../lib/server/imports";
import { LIMITS, runImport, type Upload } from "../../lib/server/import/pipeline";
import type { SourceReport } from "../../lib/server/import/types";
import { fail, json, signedIn } from "../../lib/server/http";

export const GET = signedIn((_request, user) => json({ imports: importsOf(user.id) }), { write: false });

// Files and pasted text in; the import is read in the background and the page
// asks after it by id.
// One upload per account, and two across the site from the moment the body
// is read until every file in it has been parsed, are in memory at a time.
const receiving = new Set<string>();
let reading = 0;
const SITE_READS = 2;

// A visitor's upload starts a trial account (see signedIn).
export const POST = signedIn(async (request, user) => {
  // Without a declared length the body could be any size.
  const length = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(length)) return fail("form", 411);
  if (length > LIMITS.totalBytes + 1_000_000) return fail("too_large", 413);
  if (receiving.has(user.id) || busy(user.id)) return fail("busy", 409);
  if (reading >= SITE_READS) return fail("site_busy", 503);
  receiving.add(user.id);
  reading++;
  let released = false;
  const release = () => { if (!released) { released = true; reading--; } };
  try {
    const response = await receive(request, user.id, release);
    if (response.status !== 202) release();
    return response;
  } catch (error) {
    release();
    throw error;
  } finally {
    receiving.delete(user.id);
  }
}, { trial: true });

async function receive(request: Request, userId: string, parsed: () => void) {
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("form"); }
  const uploads: Upload[] = [];
  let total = 0;
  for (const value of form.getAll("files")) {
    if (typeof value === "string") continue;
    if (value.size > LIMITS.fileBytes) return fail("file_too_large", 413);
    total += value.size;
    if (total > LIMITS.totalBytes) return fail("too_large", 413);
    uploads.push({ name: value.name.slice(0, 120) || "file", data: Buffer.from(await value.arrayBuffer()) });
  }
  const pasted = form.get("text");
  if (typeof pasted === "string" && pasted.trim()) uploads.push({ name: "pasted.txt", data: Buffer.from(pasted.slice(0, LIMITS.pasteChars), "utf8") });
  if (!uploads.length) return fail("empty");
  if (uploads.length > LIMITS.files) return fail("too_many_files");
  const reports: SourceReport[] = uploads.map((upload) => ({ name: upload.name, size: upload.data.length, format: "", flights: 0, error: null }));
  const id = startImport(userId, reports);
  void runImport(id, userId, uploads, reports, parsed);
  return json({ id }, 202);
}
