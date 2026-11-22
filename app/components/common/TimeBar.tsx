"use client";

import { useEffect, useState } from "react";
import type { YearCount } from "../../lib/insights";
import { formatNumber, ui } from "../../lib/copy";
import type { Locale } from "../../lib/i18n";
import styles from "./TimeBar.module.css";

// Every year of the archive as one column: the shape of a travelling life and
// the control that moves through it. A year narrows every section to itself.
export default function TimeBar({ counts, year, locale, onSelect, onPreview }: {
  counts: YearCount[];
  year: number | null;
  locale: Locale;
  onSelect: (year: number | null) => void;
  onPreview: (year: number | null) => void;
}) {
  const text = ui[locale].time;
  const [hover, setHover] = useState<number | null>(null);
  const years = fill(counts);
  const max = Math.max(1, ...years.map((entry) => entry.count));
  const shown = hover ?? year;
  const shownEntry = years.find((entry) => entry.year === shown);
  const index = years.findIndex((entry) => entry.year === shown);
  const enter = (value: number | null) => { setHover(value); onPreview(value); };

  // ← and → step through the years when nothing else wants the keys.
  useEffect(() => {
    const flown = years.filter((entry) => entry.count).map((entry) => entry.year);
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented) return;
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const at = year === null ? flown.length : flown.indexOf(year);
      const next = event.key === "ArrowLeft" ? flown[at - 1] : year === null ? undefined : flown[at + 1];
      if (next === undefined) return;
      event.preventDefault();
      onSelect(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={styles.bar} data-all={year === null ? "true" : undefined}>
      <div className={styles.caption}>
        <button type="button" className={styles.all} aria-pressed={year === null} onClick={() => onSelect(null)}>{text.all}</button>
        <span className={styles.readout} aria-hidden="true">
          {shownEntry ? <><b>{shownEntry.year}</b>{text.flights(formatNumber(shownEntry.count, locale))}</> : text.hint}
        </span>
      </div>
      <div className={styles.years} role="group" aria-label={text.label} onMouseLeave={() => enter(null)}>
        {years.map((entry) => (
          <button
            key={entry.year}
            type="button"
            className={styles.year}
            aria-pressed={entry.year === year}
            aria-label={`${entry.year}: ${text.flights(formatNumber(entry.count, locale))}`}
            disabled={!entry.count}
            onClick={() => onSelect(entry.year === year ? null : entry.year)}
            onMouseEnter={() => enter(entry.year)}
            onFocus={() => enter(entry.year)}
            onBlur={() => enter(null)}
          >
            <span className={styles.column}>
              <i style={{ height: `${entry.count ? Math.max(8, (entry.count / max) * 100) : 4}%` }} />
            </span>
            <small>{String(entry.year).slice(2)}</small>
          </button>
        ))}
        {index >= 0 ? <span className={styles.marker} style={{ transform: `translateX(${index * 100}%)`, width: `${100 / years.length}%` }} aria-hidden="true" /> : null}
      </div>
    </div>
  );
}

// Quiet years stay in the row as gaps, so the spacing is time.
function fill(counts: YearCount[]): YearCount[] {
  if (!counts.length) return [];
  const byYear = new Map(counts.map((entry) => [entry.year, entry]));
  const first = counts[0].year, last = counts.at(-1)!.year;
  const all: YearCount[] = [];
  for (let year = first; year <= last; year++) all.push(byYear.get(year) ?? { year, count: 0, km: 0 });
  return all;
}
