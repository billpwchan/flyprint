"use client";

import type { ReactNode } from "react";
import type { Flight } from "../../lib/data";
import styles from "./common.module.css";

export type Reading = { key: string; title: string; detail: string; flights: Flight[]; chart?: ReactNode; frame?: boolean };

// Findings written as sentences. Hovering one shows its flights on the globe;
// pressing it holds them there and brings the camera to them.
export default function Readings({ readings, pinned, onPin, onPreview, label }: {
  readings: Reading[];
  pinned: string | null;
  onPin: (key: string | null) => void;
  onPreview: (flights: Flight[] | null) => void;
  label: string;
}) {
  return (
    <section className={styles.readings} aria-label={label}>
      <ol>
        {readings.map((reading) => (
          <li key={reading.key}>
            <button
              type="button"
              className={styles.reading}
              aria-pressed={pinned === reading.key}
              onClick={() => onPin(pinned === reading.key ? null : reading.key)}
              onMouseEnter={() => onPreview(reading.flights)}
              onMouseLeave={() => onPreview(null)}
              onFocus={() => onPreview(reading.flights)}
              onBlur={() => onPreview(null)}
            >
              <strong>{reading.title}</strong>
              {reading.detail ? <span>{reading.detail}</span> : null}
              {reading.chart}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
