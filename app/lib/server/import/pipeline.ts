import { airport, airportCode, hasCarrierNames, hasPlaceNames, rememberNames, splitFlightNumber } from "../gazetteer";
import { existingOf, failImport, finishImport, setProgress } from "../imports";
import { modelAvailable, nameThings, QuotaError, readFlights, type Part } from "./claude";
import { readBoardingPass, readCalendar, readJson, readTable } from "./formats";
import { mergeRows, normalize, type Carriers } from "./normalize";
import { DESIGNATORS } from "./designators";
import { readSource, type Source } from "./sources";
import type { Candidate, SourceReport } from "./types";

export type Upload = { name: string; data: Buffer };

export const LIMITS = { files: 40, fileBytes: 15 * 1024 * 1024, totalBytes: 80 * 1024 * 1024, modelJobs: 30, pasteChars: 200_000 };
const IMAGES_PER_CALL = 4;
const ROWS_PER_CALL = 120;
const CHARS_PER_CALL = 60_000;
const PARALLEL = 3;

type Job = { parts: Part[]; label: string; reports: SourceReport[] };

const BOARDING_PASS = /M[1-4][A-Z/ .-]{20}[E ][A-Z0-9 ]{7}[A-Z]{6}[A-Z0-9 ]{3}[0-9 ]{4}[A-Z ]?\d{3}[A-Z][^\r\n]*/g;

// The fixed readers first; whatever they cannot read becomes work for the
// model. Each file is planned as soon as it is read, so only one parsed file
// is held in memory at a time.
function planner() {
  const candidates: Candidate[] = [];
  const jobs: Job[] = [];
  const images: { part: Part; report: SourceReport }[] = [];
  const asText = (text: string, report: SourceReport) => {
    for (let start = 0; start < text.length && start < CHARS_PER_CALL * 4; start += CHARS_PER_CALL) {
      jobs.push({ parts: [{ kind: "text", text: `File: ${report.name}\n\n${text.slice(start, start + CHARS_PER_CALL)}` }], label: report.name, reports: [report] });
    }
  };
  const add = (source: Source, report: SourceReport) => {
    const found = (format: string, list: Candidate[]) => { report.format = format; report.flights += list.length; candidates.push(...list); };
    switch (source.kind) {
      case "unsupported": report.error = source.reason; return;
      case "pass": {
        const legs = readBoardingPass(source.message, source.name, source.date || undefined);
        if (legs) found("Wallet", legs); else report.error = "damaged";
        return;
      }
      case "table": {
        const known = readTable(source.rows, source.name);
        if (known) { found(known.format, known.candidates); return; }
        report.format = "table";
        const [header, ...rows] = source.rows;
        for (let start = 0; start < rows.length && start < ROWS_PER_CALL * 12; start += ROWS_PER_CALL) {
          const text = [header, ...rows.slice(start, start + ROWS_PER_CALL)].map((row) => row.join("\t")).join("\n");
          jobs.push({ parts: [{ kind: "text", text: `Spreadsheet ${source.name}, rows ${start + 1}–${Math.min(rows.length, start + ROWS_PER_CALL)} (tab-separated, first line is the header):\n\n${text}` }], label: source.name, reports: [report] });
        }
        return;
      }
      case "json": {
        const known = readJson(source.value, source.name);
        if (known) { found(known.format, known.candidates); return; }
        report.format = "json";
        asText(JSON.stringify(source.value, null, 1), report);
        return;
      }
      case "text": {
        const calendar = readCalendar(source.text, source.name);
        if (calendar) { found("iCalendar", calendar); return; }
        const passes = [...source.text.matchAll(BOARDING_PASS)].flatMap((match) => readBoardingPass(match[0], source.name) ?? []);
        if (passes.length) { found("BCBP", passes); return; }
        report.format = "text";
        if (source.text.trim()) asText(source.text, report); else report.error = "empty";
        return;
      }
      case "image": report.format = "image"; images.push({ part: { kind: "image", media: source.media, data: source.data }, report }); return;
      case "pdf": report.format = "pdf"; jobs.push({ parts: [{ kind: "pdf", data: source.data }], label: source.name, reports: [report] }); return;
    }
  };
  const finish = () => {
    // Screenshots go a few at a time, so overlapping slices of one long page are read together.
    for (let start = 0; start < images.length; start += IMAGES_PER_CALL) {
      const group = images.slice(start, start + IMAGES_PER_CALL);
      jobs.push({ parts: group.map((item) => item.part), label: group[0].report.name, reports: group.map((item) => item.report) });
    }
    return { candidates, jobs };
  };
  return { add, finish };
}

async function inParallel<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}


// Names in the three languages for airports and airlines the site has not
// met before, and the IATA code behind each ICAO airline designator.
async function learnNames(userId: string, candidates: Candidate[], carriers: Carriers) {
  const places = new Set<string>(), airlines = new Set<string>();
  for (const candidate of candidates) {
    for (const text of [candidate.origin, candidate.destination]) {
      const code = airportCode(text);
      if (code && !hasPlaceNames(code)) places.add(code);
    }
    const raw = splitFlightNumber(candidate.flight)?.[0] ?? (/^[A-Z0-9]{2,3}$/.test(candidate.airline.trim()) ? candidate.airline.trim() : "");
    const designator = carriers.get(raw) ?? raw;
    if (designator && (designator.length === 3 || !hasCarrierNames(designator))) airlines.add(designator);
  }
  if (!places.size && !airlines.size) return;
  const named = await nameThings(userId, [...places].slice(0, 150).map((code) => { const info = airport(code)!; return { code, city: info.city, name: info.name, country: info.country }; }), [...airlines].slice(0, 80));
  rememberNames("place", Object.fromEntries(named.airports.filter((item) => places.has(item.code)).map((item) => [item.code, { city: item.city, name: item.name }])));
  const carrierNames: Record<string, [string, string, string]> = {};
  for (const item of named.airlines) {
    if (!airlines.has(item.code)) continue;
    const iata = /^[A-Z0-9]{2}$/.test(item.iata) ? item.iata : "";
    if (item.code.length === 3 && iata) carriers.set(item.code, iata);
    const code = iata || item.code;
    if (!hasCarrierNames(code)) carrierNames[code] = item.names;
  }
  rememberNames("carrier", carrierNames);
}

// `parsed` is called once every file has been read and planned, whatever
// happens: the upload route holds a site-wide slot until then.
export async function runImport(id: string, userId: string, uploads: Upload[], reports: SourceReport[], parsed?: () => void) {
  try {
    const plan = planner();
    try {
      for (const [index, upload] of uploads.entries()) {
        // Let other requests in between files.
        await new Promise((resolve) => setImmediate(resolve));
        plan.add(readSource(upload.name, upload.data), reports[index]);
      }
    } finally {
      // Images keep their own buffers; every other upload can go now.
      uploads.length = 0;
      parsed?.();
    }
    const { candidates, jobs } = plan.finish();
    if (jobs.length && !modelAvailable()) for (const job of jobs) for (const report of job.reports) report.error = "model_unavailable";
    else if (jobs.length > LIMITS.modelJobs) for (const job of jobs.slice(LIMITS.modelJobs)) for (const report of job.reports) report.error = "too_many";
    const work = modelAvailable() ? jobs.slice(0, LIMITS.modelJobs) : [];
    let done = 0;
    setProgress(id, { stage: "extracting", done, total: work.length });
    await inParallel(work, PARALLEL, async (job) => {
      try {
        const found = await readFlights(userId, job.parts, job.label);
        // Screenshots read together cannot say which one held which flight.
        if (job.reports.length === 1) job.reports[0].flights += found.length;
        candidates.push(...found);
      } catch (error) {
        const code = error instanceof QuotaError ? error.message : error instanceof Error && ["refused", "too_long"].includes(error.message) ? error.message : "model_failed";
        if (!(error instanceof QuotaError)) console.error("import read failed:", error instanceof Error ? error.message : error);
        for (const report of job.reports) report.error ??= code;
      }
      setProgress(id, { stage: "extracting", done: ++done, total: work.length });
    });

    const carriers: Carriers = new Map(DESIGNATORS);
    if (modelAvailable() && candidates.length) {
      setProgress(id, { stage: "naming", done: 0, total: 1 });
      try { await learnNames(userId, candidates, carriers); }
      catch (error) { console.error("import naming failed:", error instanceof Error ? error.message : error); }
    }

    setProgress(id, { stage: "checking", done: 0, total: candidates.length });
    const existing = existingOf(userId);
    const rows = mergeRows(candidates.map((candidate) => normalize(candidate, existing, carriers)), existing, carriers);
    finishImport(id, reports, rows);
  } catch (error) {
    console.error("import failed:", error);
    failImport(id, reports, "server");
  }
}
