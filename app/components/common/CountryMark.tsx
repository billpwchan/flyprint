"use client";

import { useEffect, useState } from "react";
import { geoAzimuthalEqualArea } from "d3-geo";
import styles from "./CountryMark.module.css";

// A country as its own outline, with the city lit where it is: the same
// marks the iOS app draws, from the same file (scripts/build-ios-countries.mjs).
// Each outline is an equal-area view centred on the country in a 100-unit box;
// a country of scattered islands comes as a locator instead, with the coasts
// around it and a ring round its islands.
type Outline = { center: [number, number]; scale: number; translate: [number, number]; box: [number, number, number, number]; d: string; around?: string; ring?: [number, number, number] };

let outlines: Promise<Record<string, Outline>> | null = null;
const load = (): Promise<Record<string, Outline>> => (outlines ??= fetch("/countries.json").then((response) => response.json() as Promise<Record<string, Outline>>).catch(() => { outlines = null; return {} as Record<string, Outline>; }));

export default function CountryMark({ iso, city, size = 30, color, label }: { iso: string; city?: [number, number]; size?: number; color: string; label?: string }) {
  const [shape, setShape] = useState<Outline | null>(null);
  useEffect(() => {
    let live = true;
    load().then((all) => { if (live) setShape(all[iso] ?? null); });
    return () => { live = false; };
  }, [iso]);
  if (!shape) return <span className={styles.mark} style={{ width: size, height: size }} aria-hidden="true" />;
  const [x0, y0, x1, y1] = shape.box;
  const side = Math.max(x1 - x0, y1 - y0);
  const pad = side * 0.08;
  const view = `${(x0 + x1) / 2 - side / 2 - pad} ${(y0 + y1) / 2 - side / 2 - pad} ${side + pad * 2} ${side + pad * 2}`;
  const placed = city ? geoAzimuthalEqualArea().rotate([-shape.center[0], -shape.center[1]]).scale(shape.scale).translate(shape.translate)(city) : null;
  // A city in a territory the outline leaves out (Okinawa, the Canaries) gets no dot.
  const at = placed && placed[0] >= x0 - 4 && placed[0] <= x1 + 4 && placed[1] >= y0 - 4 && placed[1] <= y1 + 4 ? placed : null;
  const dot = side * 0.055;
  return (
    <svg className={styles.mark} width={size} height={size} viewBox={view} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ "--mark": color } as React.CSSProperties}>
      {shape.around ? <path d={shape.around} className={styles.around} /> : null}
      <path d={shape.d} className={city ? styles.landQuiet : styles.land} />
      {shape.ring ? <circle cx={shape.ring[0]} cy={shape.ring[1]} r={shape.ring[2]} className={styles.ring} /> : null}
      {at ? <><circle cx={at[0]} cy={at[1]} r={dot * 2.2} className={styles.halo} /><circle cx={at[0]} cy={at[1]} r={dot} className={styles.city} /></> : null}
    </svg>
  );
}
