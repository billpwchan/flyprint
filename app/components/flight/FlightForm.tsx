"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Flight, Names } from "../../lib/data";
import { localeIndex, type Locale } from "../../lib/i18n";
import { accountUi, errorText } from "../../lib/copy-account";
import { useLocale } from "../LocaleProvider";
import { call } from "../account/api";
import base from "../account/Account.module.css";
import styles from "./FlightForm.module.css";

// One flight by hand, or a logged one put right. The server reads it the way
// it reads an import row, so codes, times and distance come out the same.

type Values = { date: string; flight: string; origin: string; destination: string; depart: string; arrive: string; seat: string; cabin: string; aircraft: string; registration: string };
const CABINS = ["economy", "premium", "business", "first"] as const;
const FIELD_OF: Record<string, keyof Values> = {
  date: "date", flight: "flight", origin: "origin", destination: "destination", same_airport: "destination", time: "depart",
  origin_ambiguous: "origin", destination_ambiguous: "destination", aircraft: "aircraft", registration: "registration", registration_type: "aircraft",
};

// The reader's own calendar day, not the UTC one.
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };

function valuesOf(flight?: Flight): Values {
  return {
    date: flight?.date ?? today(), flight: flight?.flight ?? "", origin: flight?.origin ?? "", destination: flight?.destination ?? "",
    depart: flight?.depart ?? "", arrive: flight?.arrive ?? "", seat: flight?.seat ?? "", cabin: flight?.cabin ?? "",
    aircraft: flight?.aircraft?.model ?? "", registration: flight?.aircraft?.registration ?? "",
  };
}

export default function FlightForm({ flight, onDone, onCancel }: { flight?: Flight; onDone: (id: string) => void; onCancel: () => void }) {
  const { locale } = useLocale();
  const text = accountUi[locale];
  const copy = text.flight;
  const [initial] = useState<Values>(() => valuesOf(flight));
  const [values, setValues] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);

  const set = (field: keyof Values) => (value: string) => { setValues((current) => ({ ...current, [field]: value })); if (problem) setProblem(null); };
  const changed = JSON.stringify(values) !== JSON.stringify(initial);
  const ready = !!values.date && !!values.origin.trim() && !!values.destination.trim() && (!flight || changed);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setProblem(null);
    const result = await call<{ id: string }>(flight ? `/api/flights/${encodeURIComponent(flight.id)}` : "/api/flights", { method: flight ? "PATCH" : "POST", body: values });
    setBusy(false);
    if (!result.ok) { setProblem(result.error); return; }
    onDone(result.data.id);
  };

  const wrong = problem ? FIELD_OF[problem] : undefined;
  const message = problem ? copy.problems[problem] ?? errorText(text, problem) : null;
  const field = (name: keyof Values, label: string, options: { hint?: string; mono?: boolean; type?: string; inputMode?: "text" | "numeric"; placeholder?: string; upper?: boolean; ref?: typeof first } = {}) => (
    <label className={base.field}>
      <span>{label}</span>
      <input
        ref={options.ref}
        className={`${base.input} ${options.mono ? base.mono : ""}`}
        type={options.type ?? "text"}
        inputMode={options.inputMode}
        value={values[name]}
        placeholder={options.placeholder}
        autoComplete="off"
        autoCapitalize={options.upper ? "characters" : undefined}
        spellCheck={false}
        aria-invalid={wrong === name ? "true" : undefined}
        onChange={(event) => set(name)(options.upper ? event.target.value.toUpperCase() : event.target.value)}
      />
      {options.hint ? <small>{options.hint}</small> : null}
    </label>
  );

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.pair}>
        {field("date", copy.labels.date, { type: "date", ref: flight ? undefined : first })}
        {field("flight", copy.labels.flight, { hint: copy.hints.flight, mono: true, upper: true, ref: flight ? first : undefined })}
      </div>
      <div className={styles.pair}>
        <AirportInput label={copy.labels.origin} hint={copy.hints.airport} value={values.origin} onChange={set("origin")} invalid={wrong === "origin"} locale={locale} />
        <AirportInput label={copy.labels.destination} hint={copy.hints.airport} value={values.destination} onChange={set("destination")} invalid={wrong === "destination"} locale={locale} />
      </div>
      <div className={styles.pair}>
        {field("depart", copy.labels.depart, { hint: copy.hints.time, mono: true, inputMode: "numeric", placeholder: "09:30" })}
        {field("arrive", copy.labels.arrive, { mono: true, inputMode: "numeric", placeholder: "13:05" })}
      </div>
      <div className={base.field}>
        <span>{copy.cabin}</span>
        <div className={styles.cabins} role="radiogroup" aria-label={copy.cabin}>
          {CABINS.map((cabin) => (
            <button key={cabin} type="button" role="radio" aria-checked={values.cabin === cabin} onClick={() => set("cabin")(values.cabin === cabin ? "" : cabin)}>
              {copy.cabins[cabin]}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.trio}>
        {field("seat", copy.labels.seat, { mono: true, upper: true })}
        {field("aircraft", copy.labels.aircraft, { hint: copy.hints.aircraft })}
        {field("registration", copy.labels.registration, { hint: copy.hints.registration, mono: true, upper: true })}
      </div>
      {message ? <p className={base.error} role="alert">{message}</p> : null}
      <div className={base.actions}>
        <button type="submit" className={base.primary} disabled={!ready || busy}>{busy ? copy.saving : copy.save}</button>
        <button type="button" className={base.quiet} onClick={onCancel} disabled={busy}>{copy.cancel}</button>
      </div>
    </form>
  );
}

type Match = { code: string; city: Names; name: Names; country: string; countryName: Names };

// A code, a city or an airport's name; suggestions come as the reader types,
// and the airport a code stands for is named under the field.
function AirportInput({ label, hint, value, onChange, invalid, locale }: { label: string; hint: string; value: string; onChange: (value: string) => void; invalid: boolean; locale: Locale }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [named, setNamed] = useState<Match | null>(null);
  const [resolved, setResolved] = useState<{ query: string; match: Match } | null>(null);
  const list = useId();
  const index = localeIndex(locale);

  useEffect(() => {
    const query = value.trim();
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/airports?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const answer = (await response.json()) as { airports: Match[]; resolved: string | null };
        const found = answer.airports;
        setMatches(found);
        setActive(0);
        setNamed(found.find((match) => match.code === query.toUpperCase()) ?? null);
        const lead = found.find((match) => match.code === answer.resolved);
        setResolved(lead ? { query, match: lead } : null);
      } catch { /* typing on; the next answer replaces this one */ }
    }, 140);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value]);

  const shown = value.trim() ? matches : [];
  const pick = (match: Match) => { onChange(match.code); setNamed(match); setOpen(false); };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || !shown.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((active + 1) % shown.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((active - 1 + shown.length) % shown.length); }
    else if (event.key === "Enter") { event.preventDefault(); pick(shown[active]); }
    else if (event.key === "Escape") setOpen(false);
  };
  const exact = named && named.code === value.trim().toUpperCase() ? named : null;

  return (
    <label className={`${base.field} ${styles.airport}`}>
      <span>{label}</span>
      <input
        className={base.input}
        value={value}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={list}
        aria-autocomplete="list"
        aria-activedescendant={open && shown.length ? `${list}-${active}` : undefined}
        aria-invalid={invalid ? "true" : undefined}
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          // A name leaves the field as the airport it stands for, in view before saving.
          if (resolved && resolved.query === value.trim() && value.trim().toUpperCase() !== resolved.match.code) pick(resolved.match);
        }}
        onKeyDown={onKey}
      />
      <small>{exact ? `${exact.name[index]} · ${exact.city[index]}` : hint}</small>
      {open && shown.length ? (
        <ul className={styles.suggestions} id={list} role="listbox">
          {shown.map((match, position) => (
            <li
              key={match.code}
              id={`${list}-${position}`}
              role="option"
              aria-selected={position === active}
              onMouseDown={(event) => { event.preventDefault(); pick(match); }}
              onMouseEnter={() => setActive(position)}
            >
              <b>{match.code}</b>
              <span>{match.name[index]}</span>
              {/* Same-named cities elsewhere (London, Ontario) carry their country. */}
              <i>{match.country === shown[0].country ? match.city[index] : `${match.city[index]} · ${match.countryName[index]}`}</i>
            </li>
          ))}
        </ul>
      ) : null}
    </label>
  );
}
