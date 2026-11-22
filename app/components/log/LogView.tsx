"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import type { Flight, Link as Linked } from "../../lib/data";
import { yearCounts } from "../../lib/insights";
import { searchCities, searchFlights } from "../../lib/search";
import type { Locale } from "../../lib/i18n";
import { cityOf, coordinatesOf, countryName, countryOf, metroOf } from "../../lib/places";
import { skyAlong, skyGradient } from "../../lib/daylight";
import { pathPoints } from "../../lib/network";
import { formatDayRange, formatNumber, ui } from "../../lib/copy";
import { toneColor } from "../../lib/palette";
import CarrierMark from "../CarrierMark";
import { useLocale } from "../LocaleProvider";
import { useArchive, useClock, useLinks } from "../ArchiveProvider";
import { countdownOf } from "../../lib/plan";
import { countdownText, planUi } from "../../lib/copy-plan";
import { useScene, useStage, type Scene } from "../stage/StageContext";
import { useAddressParam, useYearParam } from "../shell/address";
import { Lens, useTitle } from "../common/Lens";
import common from "../common/common.module.css";
import styles from "./LogView.module.css";

const newestFirst = (a: Flight, b: Flight) => b.date.localeCompare(a.date) || b.depart.localeCompare(a.depart);
const oldestFirst = (a: Flight, b: Flight) => a.date.localeCompare(b.date) || a.depart.localeCompare(b.depart);
const isMilestone = (count: number) => count === 1 || count % 50 === 0;

// Every flight, newest first, narrowed by the year and by what is typed.
export default function LogView({ year: serverYear, query: serverQuery }: { year: number | null; query: string }) {
  const { locale } = useLocale();
  const text = ui[locale];
  const { setPreview } = useStage();
  const [year, setYear] = useYearParam("/log", serverYear);
  const [query, setQueryParam] = useAddressParam("q", "/log", serverQuery);
  const [draft, setDraft] = useState({ value: query, from: query });
  // A query arriving from elsewhere (a link, the map) replaces what is typed.
  if (draft.from !== query) setDraft({ value: query, from: query });
  const typed = draft.value;
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = typed.trim();
      if (next === query) return;
      // Written from the field, so it must not come back and overwrite the field.
      setDraft((current) => ({ ...current, from: next }));
      setQueryParam(next);
    }, 350);
    return () => clearTimeout(timer);
  }, [typed, query, setQueryParam]);
  useEffect(() => {
    const clear = () => { setDraft({ value: "", from: "" }); setQueryParam(""); };
    window.addEventListener("flyprint:reselect", clear);
    return () => window.removeEventListener("flyprint:reselect", clear);
  }, [setQueryParam]);
  useTitle(year ? `${text.nav.log} · ${year}` : text.nav.log);

  const { flights: scoped, ahead } = useArchive();
  const links = useLinks();
  const clock = useClock();
  const counts = useMemo(() => yearCounts(scoped), [scoped]);
  const list = useMemo(() => year ? scoped.filter((flight) => flight.year === year) : scoped, [scoped, year]);
  // Each flight's place in the scope's history, so the 100th flight can say so.
  const ordinals = useMemo(() => new Map([...scoped].sort(oldestFirst).map((flight, index) => [flight.id, index + 1])), [scoped]);
  const results = useMemo(() => [...searchFlights(list, typed)].sort(newestFirst), [list, typed]);
  const settled = useMemo(() => searchFlights(list, query), [list, query]);
  // Flights still ahead lead the list, soonest first, under the same year and search.
  const aheadInScope = useMemo(() => year ? ahead.filter((flight) => flight.year === year) : ahead, [ahead, year]);
  const aheadResults = useMemo(() => searchFlights(aheadInScope, typed), [aheadInScope, typed]);
  const aheadSettled = useMemo(() => searchFlights(aheadInScope, query), [aheadInScope, query]);
  const cities = useMemo(() => typed.trim() ? searchCities(new Set(list.flatMap((flight) => [flight.origin, flight.destination])), typed).slice(0, 3) : [], [list, typed]);

  const active = query.trim().length > 0;
  const focus = useMemo(() => active ? [...aheadSettled, ...settled] : year ? list : null, [active, aheadSettled, settled, year, list]);
  const scene = useMemo<Scene>(() => ({
    flights: scoped,
    focus: focus?.length ? focus : null,
    camera: active && focus?.length && focus.length <= 60
      ? { kind: "fit", points: pathPoints(focus), maxZoom: 5 }
      : { kind: "world", around: focus?.length ? focus : undefined },
    cameraKey: `log:${year ?? "all"}:${active ? query.trim().toLowerCase() : ""}`,
  }), [scoped, focus, active, year, query]);
  useScene(scene);

  const grouped = useMemo(() => {
    const groups = new Map<number, Flight[]>();
    for (const flight of results) groups.set(flight.year, [...(groups.get(flight.year) ?? []), flight]);
    return [...groups.entries()];
  }, [results]);
  const n = (value: number) => formatNumber(value, locale);
  const searching = typed.trim().length > 0;

  return (
    <Lens counts={counts} year={year} onYear={setYear} onPreviewYear={(value) => setPreview(value ? scoped.filter((flight) => flight.year === value) : null)}>
      <h1 className="visually-hidden">{year ? `${text.nav.log} · ${year}` : text.nav.log}</h1>
      <label className={styles.search}>
        <Search aria-hidden="true" />
        <input
          ref={input}
          id="log-search"
          type="search"
          value={typed}
          onChange={(event) => setDraft({ value: event.target.value, from: query })}
          onKeyDown={(event) => { if (event.key === "Escape" && typed) { event.preventDefault(); setDraft({ value: "", from: query }); } }}
          placeholder={text.log.search}
          aria-label={text.log.label}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        {typed ? <button type="button" onClick={() => { setDraft({ value: "", from: query }); input.current?.focus(); }} aria-label={text.log.clear}><X aria-hidden="true" /></button> : <kbd aria-hidden="true">/</kbd>}
      </label>
      <p className={styles.count} aria-live="polite">
        {searching ? (results.length + aheadResults.length ? text.log.found(n(results.length + aheadResults.length)) : text.log.none(typed.trim())) : text.log.count(n(list.length))}
      </p>

      {cities.length ? (
        <section className={styles.cities} aria-label={text.log.cities}>
          {cities.map((code) => (
            <Link key={code} href={`/places/${encodeURIComponent(metroOf(code))}`} className={styles.cityResult}>
              <strong>{cityOf(code, locale)}</strong>
              <span>{countryName(countryOf(code), locale)}</span>
              <ChevronRight aria-hidden="true" />
            </Link>
          ))}
        </section>
      ) : null}

      {aheadResults.length ? (
        <section className={common.group} aria-labelledby="log-ahead">
          <header className={common.groupHead}>
            <h2 id="log-ahead">{planUi[locale].ahead}</h2>
            <span>{planUi[locale].legs(n(aheadResults.length))}</span>
          </header>
          <ol className={styles.rows}>
            {aheadResults.map((flight) => <Row key={flight.id} flight={flight} ordinal={0} when={countdownText(countdownOf(flight, clock), flight.depart, locale, true)} locale={locale} companion={flight.with?.length ? links.get(flight.with[0]) : undefined} onPreview={setPreview} />)}
          </ol>
        </section>
      ) : null}

      {grouped.map(([groupYear, yearFlights]) => (
        <section key={groupYear} className={common.group} aria-labelledby={`log-${groupYear}`}>
          <header className={common.groupHead}>
            <h2 id={`log-${groupYear}`}>{groupYear}</h2>
            <span>{text.units.flights(n(yearFlights.length))}</span>
          </header>
          <ol className={styles.rows}>
            {yearFlights.map((flight) => <Row key={flight.id} flight={flight} ordinal={ordinals.get(flight.id) ?? 0} locale={locale} companion={flight.with?.length ? links.get(flight.with[0]) : undefined} onPreview={setPreview} />)}
          </ol>
        </section>
      ))}
    </Lens>
  );
}

function Row({ flight, ordinal, when, locale, companion, onPreview }: { flight: Flight; ordinal: number; when?: string; locale: Locale; companion?: Linked; onPreview: (flights: Flight[] | null) => void }) {
  const text = ui[locale];
  const { owner } = useArchive();
  const offset = flight.arrivalDayOffset ?? 0;
  // The sky the flight flew through, as a hairline under it, as the app draws it.
  const sky = useMemo(() => flight.departAt && flight.durationMinutes > 0
    ? skyGradient(skyAlong(coordinatesOf(flight.origin), coordinatesOf(flight.destination), flight.departAt, flight.durationMinutes, 24))
    : null, [flight]);
  return (
    <li>
      <Link
        href={`/flights/${encodeURIComponent(flight.id)}`}
        className={styles.row}
        onMouseEnter={() => onPreview([flight])}
        onMouseLeave={() => onPreview(null)}
        onFocus={() => onPreview([flight])}
        onBlur={() => onPreview(null)}
      >
        <span className={styles.date}>
          {formatDayRange(flight.date, flight.date, locale)}
          {when ? <small data-soon="true" style={{ "--tone": toneColor(owner.tone) } as React.CSSProperties}>{when}</small> : isMilestone(ordinal) ? <small>{text.flight.milestone(formatNumber(ordinal, locale))}</small> : null}
        </span>
        <span className={styles.route}>
          <span className={styles.codes}><b>{flight.origin}</b><i aria-hidden="true">→</i><b>{flight.destination}</b></span>
          <span className={styles.cityNames}>{cityOf(flight.origin, locale)} – {cityOf(flight.destination, locale)}</span>
        </span>
        <span className={styles.flight}>
          <CarrierMark airline={flight.airline} size={16} />
          <span>{flight.flight}</span>
          {companion ? <i className={styles.dot} style={{ background: toneColor(companion.tone) }} title={text.pair.with(companion.name)} aria-label={text.pair.with(companion.name)} role="img" /> : null}
        </span>
        <span className={styles.time}>
          {flight.depart}
          <small>{flight.arrive}{offset ? <sup>{offset > 0 ? `+${offset}` : offset}</sup> : null}</small>
        </span>
        {sky ? <i className={styles.sky} style={{ background: sky }} aria-hidden="true" /> : null}
      </Link>
    </li>
  );
}
