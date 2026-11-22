"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, PenLine, Plus } from "lucide-react";
import { accountUi, errorText, type AccountCopy } from "../../lib/copy-account";
import { formatDate, formatNumber } from "../../lib/copy";
import { registerAtlas } from "../../lib/atlas";
import { cityOf } from "../../lib/places";
import { pathPoints } from "../../lib/network";
import type { Archive, Flight } from "../../lib/data";
import { brandName, type Locale } from "../../lib/i18n";
import type { DraftRow, Fields, SourceReport } from "../../lib/server/import/types";
import { useLocale } from "../LocaleProvider";
import { useArchive, useViewer } from "../ArchiveProvider";
import { useScene, useStage, type Scene } from "../stage/StageContext";
import { useTitle } from "../common/Lens";
import { call, reload } from "./api";
import FlightForm from "../flight/FlightForm";
import { Consent } from "./AuthView";
import { publicUi } from "../../lib/copy-public";
import base from "./Account.module.css";
import styles from "./Import.module.css";

type Status = "reading" | "ready" | "failed" | "saved" | "undone" | "discarded";
type Progress = { stage: "reading" | "extracting" | "naming" | "checking"; done: number; total: number };
type Draft = { id: string; status: Status; sources: SourceReport[]; added: number; updated?: number; removed?: number; error: string | null; rows: DraftRow[]; progress: Progress | null; atlas?: Pick<Archive, "places" | "carriers" | "countries"> };
type Edit = { include?: boolean; fields: Partial<Fields> };

const BLOCKING = new Set(["date", "origin", "destination", "same_airport"]);
const ACCEPT = "image/*,.pdf,.ofd,.csv,.tsv,.txt,.json,.xlsx,.ics,.eml,.pkpass,.html,.htm,.xml";

// A phone's long screenshot is cut into overlapping pieces the model can read
// at full size; a large photo is scaled down. Anything else goes as it is.
async function prepare(file: File): Promise<File[]> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return [file];
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return [file]; }
  const { width, height } = bitmap;
  const tall = height / width > 2.3;
  if (!tall && file.size < 3_500_000 && Math.max(width, height) <= 2600) { bitmap.close(); return [file]; }
  const sliceHeight = tall ? Math.round(width * 2) : height;
  const overlap = tall ? Math.round(sliceHeight * 0.08) : 0;
  const scale = Math.min(1, 2000 / Math.max(width, sliceHeight));
  const stem = file.name.replace(/\.[^.]+$/, "") || "screenshot";
  const pieces: File[] = [];
  for (let top = 0, index = 0; top < height && index < 12; top += sliceHeight - overlap, index++) {
    const h = Math.min(sliceHeight, height - top);
    if (index > 0 && h < overlap * 1.5) break;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(h * scale);
    const context = canvas.getContext("2d");
    if (!context) break;
    context.drawImage(bitmap, 0, top, width, h, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (blob) pieces.push(new File([blob], tall ? `${stem}-${index + 1}.jpg` : `${stem}.jpg`, { type: "image/jpeg" }));
    if (!tall) break;
  }
  bitmap.close();
  return pieces.length ? pieces : [file];
}

const size = (bytes: number) => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;

const valueOf = (row: DraftRow, edit: Edit | undefined) => ({ ...row.fields, ...edit?.fields });
const isBlocked = (row: DraftRow) => row.problems.some((problem) => BLOCKING.has(problem));
const includedOf = (row: DraftRow, edit: Edit | undefined) => !isBlocked(row) && (edit?.include ?? row.include);

// A row as a flight the globe can draw before it is saved.
const asFlight = (row: DraftRow): Flight => ({
  id: `draft:${row.key}`, date: row.fields.date, year: Number(row.fields.date.slice(0, 4)), airline: row.airline, flight: row.fields.flight,
  origin: row.fields.origin, destination: row.fields.destination, depart: row.fields.depart, arrive: row.fields.arrive,
  arrivalDayOffset: row.arrivalDayOffset, durationMinutes: row.durationMinutes, timeSource: row.timeSource, km: row.km,
  // A booking still ahead draws as a plan.
  ...(row.upcoming ? { arriveAt: Date.parse(`${row.fields.date}T00:00:00Z`) + 2 * 86_400_000 } : {}),
});

export default function ImportView({ initialId }: { initialId: string | null }) {
  const { locale } = useLocale();
  const text = accountUi[locale];
  const router = useRouter();
  const { flights } = useArchive();
  const viewer = useViewer();
  // A visitor's first upload starts a trial; the map it draws is theirs to keep by signing up.
  const trial = !viewer || viewer.trial !== null;
  const { setPreview } = useStage();
  const [id, setId] = useState(initialId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pasting, setPasting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState<"upload" | "save" | "undo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [undone, setUndone] = useState<{ removed: number; restored: number } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pasteBox = useRef<HTMLTextAreaElement>(null);
  useTitle(text.import.title);

  if (draft?.atlas) registerAtlas(draft.atlas);
  const status = draft?.status ?? null;
  const phase = !id ? "pick" : !draft ? "loading" : status === "reading" ? "reading" : status === "ready" ? "review" : status === "saved" ? "saved" : status === "failed" ? "failed" : "pick";

  // Ask after the import while it is being read; it carries on if the reader leaves.
  useEffect(() => {
    if (!id) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => call<Draft>(`/api/imports/${id}`).then((result) => {
      if (!live) return;
      if (!result.ok) { setError(result.error); return; }
      setDraft(result.data);
      if (result.data.status === "reading") timer = setTimeout(poll, 1200);
    });
    void poll();
    return () => { live = false; clearTimeout(timer); };
  }, [id]);

  // Once saved, a phone's sheet comes down so the new routes show on the globe.
  useEffect(() => {
    if (phase === "saved") window.dispatchEvent(new CustomEvent("flyprint:sheet", { detail: 1 }));
  }, [phase]);

  // Files dropped anywhere on the window join the list.
  useEffect(() => {
    if (phase !== "pick") return;
    let depth = 0;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const enter = (event: DragEvent) => { if (!hasFiles(event)) return; depth++; setDragging(true); };
    const leave = (event: DragEvent) => { if (!hasFiles(event)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const over = (event: DragEvent) => { if (hasFiles(event)) event.preventDefault(); };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const dropped = Array.from(event.dataTransfer?.files ?? []);
      setFiles((current) => [...current, ...dropped]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragleave", leave); window.removeEventListener("dragover", over); window.removeEventListener("drop", drop); };
  }, [phase]);

  const rows = useMemo(() => draft?.rows ?? [], [draft]);
  const chosen = useMemo(() => rows.filter((row) => includedOf(row, edits[row.key])), [rows, edits]);
  const lit = useMemo(() => (phase === "review" || phase === "saved" ? chosen : []).filter((row) => !isBlocked(row)).map(asFlight), [phase, chosen]);
  // A visitor's Earth starts empty, so the first routes drawn on it are their own.
  useScene(useMemo<Scene>(() => ({
    flights: viewer ? flights : [],
    focus: lit.length ? lit : null,
    camera: lit.length ? { kind: "fit", points: pathPoints(lit), maxZoom: 5 } : { kind: "world" },
    cameraKey: `import:${id ?? "new"}:${phase}:${lit.length ? "lit" : "world"}`,
  }), [flights, viewer, lit, id, phase]));

  const start = async () => {
    if (busy) return;
    setBusy("upload");
    setError(null);
    const form = new FormData();
    for (const file of files) for (const piece of await prepare(file)) form.append("files", piece, piece.name);
    if (pasted.trim()) form.append("text", pasted);
    const result = await call<{ id: string }>("/api/imports", { form });
    setBusy(null);
    if (!result.ok) { setError(result.error); return; }
    setFiles([]);
    setPasted("");
    setPasting(false);
    setEdits({});
    setDraft(null);
    setId(result.data.id);
    router.replace(`/import?id=${result.data.id}`, { scroll: false });
    // The upload began a trial: the account menu and the rest of the site follow it.
    if (!viewer) router.refresh();
  };

  // Each edit carries the state the reader was shown, so the server acts only on that.
  const editsFor = (overrides: Record<string, Edit> = edits) => rows.map((row) => ({ key: row.key, include: includedOf(row, overrides[row.key]), fields: overrides[row.key]?.fields ?? {}, seen: row.state }));

  // Rows the server sees differently now take its tick, which the reader can change again.
  const adopt = (next: DraftRow[], atlas: Draft["atlas"]) => {
    const was = new Map(rows.map((row) => [row.key, row.state]));
    const moved = new Set(next.filter((row) => was.get(row.key) !== row.state).map((row) => row.key));
    if (moved.size) setEdits((current) => Object.fromEntries(Object.entries(current).map(([key, edit]) => [key, moved.has(key) ? { fields: edit.fields } : edit])));
    setDraft((current) => current ? { ...current, rows: next, atlas } : current);
  };

  // A finished edit is checked on the server, which knows airports and times.
  const finishEdit = async (key: string) => {
    setOpen(null);
    // A row that could not be saved joins once fixed; any other keeps its choice.
    const row = rows.find((item) => item.key === key);
    const repaired = row && isBlocked(row) ? { include: true } : {};
    const next = { ...edits, [key]: { ...edits[key], ...repaired, fields: edits[key]?.fields ?? {} } };
    setEdits(next);
    const result = await call<{ rows: DraftRow[]; atlas: Draft["atlas"] }>(`/api/imports/${id}`, { body: { action: "check", edits: editsFor(next) } });
    if (result.ok) adopt(result.data.rows, result.data.atlas);
  };

  const save = async () => {
    if (busy || !id) return;
    setBusy("save");
    setError(null);
    const result = await call<{ added: number; updated: number; removed: number; changed?: undefined } | { changed: true; rows: DraftRow[]; atlas: Draft["atlas"] }>(`/api/imports/${id}`, { body: { action: "save", edits: editsFor() } });
    setBusy(null);
    if (!result.ok) { setError(result.error); return; }
    const saved = result.data;
    if (saved.changed) { adopt(saved.rows, saved.atlas); setError("changed"); return; }
    setDraft((current) => current ? { ...current, status: "saved", added: saved.added, updated: saved.updated, removed: saved.removed } : current);
    router.refresh();
  };

  const withdraw = async () => {
    if (busy || !id) return;
    setBusy("undo");
    const result = await call<{ status: string; removed: number; restored?: number; reverted?: number }>(`/api/imports/${id}`, { method: "DELETE" });
    setBusy(null);
    if (!result.ok) { setError(result.error); return; }
    if (result.data.status === "undone") { setUndone({ removed: result.data.removed, restored: (result.data.restored ?? 0) + (result.data.reverted ?? 0) }); router.refresh(); }
    reset();
  };

  const reset = () => {
    setId(null);
    setDraft(null);
    setEdits({});
    setOpen(null);
    setError(null);
    router.replace("/import", { scroll: false });
  };

  const setInclude = (key: string, include: boolean) => setEdits((current) => ({ ...current, [key]: { ...current[key], include, fields: current[key]?.fields ?? {} } }));
  const setField = (key: string, field: keyof Fields, value: string) => setEdits((current) => ({ ...current, [key]: { ...current[key], fields: { ...current[key]?.fields, [field]: value } } }));

  return (
    <div className={base.page}>
      {dragging ? <div className={styles.dropping}>{text.import.drop}</div> : null}

      {phase === "pick" ? (
        <>
          <h1 className={base.title}>{text.import.title}</h1>
          <p className={base.lead}>{viewer ? text.import.lead : text.trial.importLead}</p>
          {undone !== null ? <p className={base.ok} style={{ marginTop: 14 }}>{undone.removed || !undone.restored ? text.import.undone(formatNumber(undone.removed, locale)) : text.import.restored(formatNumber(undone.restored, locale))}</p> : null}
          <div className={styles.start}>
            <button type="button" className={base.primary} onClick={() => picker.current?.click()}><Plus aria-hidden="true" />{text.import.choose}</button>
            <button type="button" className={base.quiet} onClick={() => { setPasting(!pasting); setAdding(false); if (!pasting) requestAnimationFrame(() => pasteBox.current?.focus()); }} aria-expanded={pasting}><ClipboardPaste aria-hidden="true" />{text.import.paste}</button>
            <button type="button" className={base.quiet} onClick={() => { setAdding(!adding); setPasting(false); }} aria-expanded={adding}><PenLine aria-hidden="true" />{text.flight.add}</button>
            <input ref={picker} type="file" multiple accept={ACCEPT} hidden onChange={(event) => { const picked = Array.from(event.target.files ?? []); event.target.value = ""; setFiles((current) => [...current, ...picked]); }} />
          </div>
          {adding ? (
            <section className={styles.manual} aria-label={text.flight.addTitle}>
              <p className={base.note}>{text.flight.addLead}</p>
              <FlightForm onCancel={() => setAdding(false)} onDone={(id) => reload(`/flights/${encodeURIComponent(id)}`)} />
            </section>
          ) : null}
          {pasting ? <textarea className={base.textarea} style={{ marginTop: 18 }} value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder={text.import.pastePlaceholder} ref={pasteBox} /> : null}
          {files.length ? (
            <div className={styles.picked}>
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className={styles.file}>
                  <strong>{file.name}</strong>
                  <span>{size(file.size)}</span>
                  <button type="button" onClick={() => setFiles((current) => current.filter((_, position) => position !== index))}>{text.import.remove}</button>
                </div>
              ))}
            </div>
          ) : null}
          {files.length || pasted.trim() ? (
            <div className={styles.start} style={{ marginTop: 20 }}>
              <button type="button" className={base.primary} onClick={start} disabled={!!busy}>{busy === "upload" ? text.auth.working : text.import.start}</button>
              {files.length ? <span className={base.note}>{text.import.files(formatNumber(files.length, locale))}</span> : null}
            </div>
          ) : null}
          {!viewer && (files.length || pasted.trim() || adding) ? <Consent parts={publicUi[locale].legal.agreeImport} /> : null}
          {error ? <p className={base.error} style={{ marginTop: 14 }}>{errorText(text, error)}</p> : null}

          <section className={base.section}>
            <h2 className={base.sectionTitle}>{text.import.canRead}</h2>
            <div className={styles.formats}>
              {text.import.formats.map(([name, detail]) => <p key={name} className={styles.format}><b>{name}</b><span>{detail}</span></p>)}
            </div>
            <p className={base.note} style={{ marginTop: 18 }}>{text.import.umetrip}</p>
            <p className={base.fine} style={{ marginTop: 10 }}>{text.import.privacy}</p>
          </section>
        </>
      ) : null}

      {phase === "loading" ? <p className={base.note}>{error ? errorText(text, error) : text.auth.working}</p> : null}

      {phase === "reading" && draft ? (
        <>
          <h1 className={base.title}>{text.import.title}</h1>
          <div className={styles.reading} aria-live="polite">
            <p className={styles.stage}>{stageText(text, draft.progress, locale)}</p>
            <div className={styles.track}><i style={{ width: `${progressShare(draft.progress) * 100}%` }} /></div>
            <p className={base.note} style={{ marginTop: 16 }}>{text.import.slow}</p>
          </div>
          <Sources text={text} locale={locale} sources={draft.sources} pending />
        </>
      ) : null}

      {phase === "failed" && draft ? (
        <>
          <h1 className={base.title}>{text.import.failed}</h1>
          <p className={base.error} style={{ marginTop: 10 }}>{errorText(text, draft.error)}</p>
          <div className={styles.start}><button type="button" className={base.primary} onClick={reset}>{text.import.retry}</button></div>
          <Sources text={text} locale={locale} sources={draft.sources} />
        </>
      ) : null}

      {phase === "review" && draft ? (
        <>
          <h1 className={base.title}>{rows.length ? (chosen.some((row) => row.state === "update" || row.state === "remove") ? text.import.foundChanges : text.import.found)(formatNumber(rows.length, locale), formatNumber(chosen.length, locale)) : text.import.nothing}</h1>
          {rows.length ? (
            <div className={styles.toolbar}>
              <span>{(["new", "update", "remove", "duplicate", "cancelled", "problem"] as const).map((state) => [state, rows.filter((row) => row.state === state).length] as const).filter(([, count]) => count).map(([state, count]) => `${text.import.state[state]} ${formatNumber(count, locale)}`).join(" · ")}</span>
              <button type="button" onClick={() => {
                const all = chosen.length < rows.filter((row) => !isBlocked(row)).length;
                setEdits((current) => Object.fromEntries(rows.map((row) => [row.key, { ...current[row.key], include: all, fields: current[row.key]?.fields ?? {} }])));
              }}>{chosen.length < rows.filter((row) => !isBlocked(row)).length ? text.import.all : text.import.none}</button>
            </div>
          ) : null}
          <ol className={styles.rows}>
            {rows.map((row) => (
              <Row
                key={row.key}
                row={row}
                edit={edits[row.key]}
                open={open === row.key}
                text={text}
                locale={locale}
                onToggle={(include) => setInclude(row.key, include)}
                onOpen={() => setOpen(open === row.key ? null : row.key)}
                onField={(field, value) => setField(row.key, field, value)}
                onDone={() => finishEdit(row.key)}
                onPreview={(on) => setPreview(on && !isBlocked(row) ? [asFlight(row)] : null)}
              />
            ))}
          </ol>
          <div className={styles.bar}>
            {rows.length ? <button type="button" className={base.primary} onClick={save} disabled={!!busy || !chosen.length}>{busy === "save" ? text.import.saving : text.import.save(formatNumber(chosen.length, locale))}</button> : null}
            <button type="button" className={base.quiet} onClick={withdraw} disabled={!!busy}>{text.import.discard}</button>
            {error ? <span className={base.error}>{errorText(text, error)}</span> : null}
          </div>
          <Sources text={text} locale={locale} sources={draft.sources} />
        </>
      ) : null}

      {phase === "saved" && draft ? (
        <div className={styles.done}>
          <h1 className={base.title}>{draft.updated || draft.removed ? text.import.savedAll(formatNumber(draft.added, locale), formatNumber(draft.updated ?? 0, locale), formatNumber(draft.removed ?? 0, locale)) : text.import.saved(formatNumber(draft.added, locale))}</h1>
          <p className={base.lead}>{trial ? text.trial.savedLead : text.import.savedLead}</p>
          {trial ? (
            <div className={styles.start}>
              <Link href="/" className={base.primary}>{text.trial.view}</Link>
              <Link href="/signup" className={base.quiet}>{text.trial.keep}</Link>
              <button type="button" className={base.quiet} onClick={reset}>{text.import.again}</button>
            </div>
          ) : (
            <div className={styles.start}>
              <Link href="/log" className={base.primary}>{text.import.view}</Link>
              <button type="button" className={base.quiet} onClick={reset}>{text.import.again}</button>
              <button type="button" className={base.quiet} onClick={withdraw} disabled={!!busy}>{text.import.undo}</button>
            </div>
          )}
          {error ? <p className={base.error} style={{ marginTop: 12 }}>{errorText(text, error)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function progressShare(progress: Progress | null) {
  if (!progress) return 0.04;
  if (progress.stage === "reading") return 0.06;
  if (progress.stage === "extracting") return 0.08 + 0.72 * (progress.total ? progress.done / progress.total : 1);
  return progress.stage === "naming" ? 0.86 : 0.95;
}

function stageText(text: AccountCopy, progress: Progress | null, locale: Locale) {
  if (!progress || progress.stage === "reading") return text.import.stage.reading;
  if (progress.stage === "extracting") return text.import.stage.extracting(formatNumber(progress.done, locale), formatNumber(progress.total, locale));
  return text.import.stage[progress.stage];
}

function Sources({ text, locale, sources, pending = false }: { text: AccountCopy; locale: Locale; sources: SourceReport[]; pending?: boolean }) {
  return (
    <section className={styles.sources}>
      <h2 className={base.sectionTitle}>{text.import.sources}</h2>
      {sources.map((source, index) => (
        <div key={`${source.name}-${index}`} className={styles.file} data-error={source.error ? "true" : undefined}>
          <strong>{source.name}</strong>
          <span>{source.error ? errorText(text, source.error) : pending ? size(source.size) : [source.format === "Flyprint" ? brandName[locale] : source.format, source.flights ? text.import.flightsIn(formatNumber(source.flights, locale)) : text.import.read].filter(Boolean).join(" · ")}</span>
        </div>
      ))}
    </section>
  );
}

function Row({ row, edit, open, text, locale, onToggle, onOpen, onField, onDone, onPreview }: {
  row: DraftRow; edit: Edit | undefined; open: boolean; text: AccountCopy; locale: Locale;
  onToggle: (include: boolean) => void; onOpen: () => void; onField: (field: keyof Fields, value: string) => void; onDone: () => void; onPreview: (on: boolean) => void;
}) {
  const fields = valueOf(row, edit);
  const blocked = isBlocked(row);
  const included = includedOf(row, edit);
  const known = (code: string, problem: string) => !row.problems.includes(problem as DraftRow["problems"][number]);
  const place = (code: string, problem: string) => known(code, problem)
    ? <>{cityOf(code, locale)}<small>{code}</small></>
    : <em>{code || "?"}</em>;
  const times = fields.depart || fields.arrive ? `${fields.depart || "--:--"}–${fields.arrive || "--:--"}${row.arrivalDayOffset > 0 ? `+${row.arrivalDayOffset}` : ""}` : "";
  const tags: { label: string; tone?: "warn" | "muted" }[] = [];
  if (row.state === "duplicate") tags.push({ label: row.likely ? text.import.likely : text.import.state.duplicate, tone: row.likely ? undefined : "muted" });
  if (row.state === "cancelled") tags.push({ label: text.import.state.cancelled, tone: "muted" });
  if (row.state === "update") tags.push({ label: text.import.state.update });
  if (row.state === "remove") tags.push({ label: text.import.state.remove, tone: "warn" });
  if (row.upcoming) tags.push({ label: text.import.upcoming });
  if (!row.sure) tags.push({ label: text.import.unsure, tone: "warn" });
  const cabin = fields.cabin ? text.flight.cabins[fields.cabin] : "";
  return (
    <li className={styles.row} data-included={included ? "true" : "false"} data-open={open ? "true" : undefined} onMouseEnter={() => onPreview(true)} onMouseLeave={() => onPreview(false)}>
      <button type="button" role="checkbox" aria-checked={included} className={styles.check} disabled={blocked} onClick={() => onToggle(!included)} aria-label={`${fields.flight} ${fields.date}`} />
      <div className={styles.main} onClick={onOpen} role="button" tabIndex={0} aria-expanded={open} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}>
        <div className={styles.line}>
          <span className={styles.code}>{fields.flight || "—"}</span>
          <span className={styles.route}>{place(fields.origin, "origin")} → {place(fields.destination, "destination")}</span>
        </div>
        <div className={styles.meta}>
          <span>{fields.date ? formatDate(fields.date, locale) : "—"}</span>
          {times ? <span>{times}</span> : null}
          {fields.seat || cabin ? <span>{[cabin, fields.seat].filter(Boolean).join(" ")}</span> : null}
          {row.candidate.passenger ? <span>{text.import.passenger} {row.candidate.passenger}</span> : null}
          {tags.map((tag) => <span key={tag.label} className={styles.tag} data-tone={tag.tone}>{tag.label}</span>)}
        </div>
        {row.state === "update" && row.changes?.length ? (
          <p className={styles.changes}>{row.changes.map((change) => {
            const shown = (value: string) => change.field === "cabin" ? text.flight.cabins[value] ?? value : value;
            return text.import.change(text.import.field[change.field], shown(change.from), shown(change.to));
          }).join(" · ")}</p>
        ) : null}
        {row.problems.length ? <p className={styles.problems}>{row.problems.map((problem) => text.import.problem[problem]).join("；")}</p> : null}
      </div>
      {open ? (
        <div className={styles.editor}>
          <label><span>{text.import.field.date}</span><input type="date" value={fields.date} onChange={(event) => onField("date", event.target.value)} aria-invalid={row.problems.includes("date") || undefined} /></label>
          <label><span>{text.import.field.flight}</span><input data-code value={fields.flight} onChange={(event) => onField("flight", event.target.value)} maxLength={8} /></label>
          <label><span>{text.import.field.origin}</span><input data-code value={fields.origin} onChange={(event) => onField("origin", event.target.value)} maxLength={4} aria-invalid={row.problems.includes("origin") || undefined} /></label>
          <label><span>{text.import.field.destination}</span><input data-code value={fields.destination} onChange={(event) => onField("destination", event.target.value)} maxLength={4} aria-invalid={row.problems.includes("destination") || undefined} /></label>
          <label><span>{text.import.field.depart}</span><input type="time" value={fields.depart} onChange={(event) => onField("depart", event.target.value)} /></label>
          <label><span>{text.import.field.arrive}</span><input type="time" value={fields.arrive} onChange={(event) => onField("arrive", event.target.value)} /></label>
          <label><span>{text.import.field.seat}</span><input data-code value={fields.seat} onChange={(event) => onField("seat", event.target.value)} maxLength={5} /></label>
          <label><span>{text.import.field.cabin}</span>
            <select value={fields.cabin} onChange={(event) => onField("cabin", event.target.value)}>
              <option value="">—</option>
              {Object.entries(text.flight.cabins).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className={styles.editorActions}>
            <button type="button" className={base.primary} onClick={onDone}>{text.import.done}</button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
