"use client";

import { useId } from "react";
import { aircraftType } from "../../lib/aircraft/catalog";
import { draw, type Drawing } from "../../lib/aircraft/profile";
import styles from "./AircraftProfile.module.css";

const drawings = new Map<string, Drawing>();
function drawingOf(icao: string) {
  const type = aircraftType(icao);
  if (!type) return null;
  let drawing = drawings.get(type.icao);
  if (!drawing) { drawing = draw(type.variant); drawings.set(type.icao, drawing); }
  return drawing;
}

export const canDraw = (icao: string | undefined) => !!aircraftType(icao);

const PAD = 0.4;

// A type's side view. With `span` (metres) several drawings share one scale:
// each takes the share of its row that its length is of `span`. Without it the
// drawing fills its box. `length` labels a dimension line under the fuselage.
export default function AircraftProfile({ icao, span, length, tentative, label }: {
  icao: string;
  span?: number;
  length?: string;
  tentative?: boolean;
  label?: string;
}) {
  const id = `p${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const drawing = drawingOf(icao);
  if (!drawing) return null;
  const width = drawing.length + PAD * 2;
  const height = drawing.top - drawing.bottom + PAD * 2;
  const share = span ? Math.min(1, width / (span + PAD * 2)) : 1;
  const inset = `${(PAD / width) * 100}%`;
  return (
    <figure
      className={styles.profile}
      data-tentative={tentative ? "true" : undefined}
      style={{ width: `${share * 100}%` }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox={`${-PAD} ${-(drawing.top + PAD)} ${width} ${height}`} preserveAspectRatio="xMinYMax meet">
        <defs>
          <linearGradient id={`${id}lit`} gradientUnits="userSpaceOnUse" x1="0" y1={-drawing.half} x2="0" y2={drawing.half}>
            <stop offset="0" stopColor="#1a2029" />
            <stop offset="0.55" stopColor="#0f1217" />
            <stop offset="1" stopColor="#090b0e" />
          </linearGradient>
        </defs>
        {drawing.parts.map((part, index) => (
          <path key={index} className={styles[part.kind]} d={part.d} fill={part.kind === "body" ? `url(#${id}lit)` : undefined} />
        ))}
      </svg>
      {length ? (
        <figcaption className={styles.dimension} style={{ marginLeft: inset, marginRight: inset }}>
          <i /><span>{length}</span><i />
        </figcaption>
      ) : null}
    </figure>
  );
}
