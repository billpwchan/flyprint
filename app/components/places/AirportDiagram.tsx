import type { Runway } from "../../lib/runways";
import styles from "./AirportDiagram.module.css";

const KM_PER_DEGREE = 111.32;

// Metres east and north of a reference point.
const project = (lon: number, lat: number, lon0: number, lat0: number): [number, number] =>
  [(lon - lon0) * KM_PER_DEGREE * 1000 * Math.cos((lat0 * Math.PI) / 180), (lat - lat0) * KM_PER_DEGREE * 1000];

export function extentOf(runways: Runway[]) {
  const lon0 = runways.reduce((sum, r) => sum + r[0] + r[2], 0) / (runways.length * 2);
  const lat0 = runways.reduce((sum, r) => sum + r[1] + r[3], 0) / (runways.length * 2);
  const points = runways.flatMap((r) => [project(r[0], r[1], lon0, lat0), project(r[2], r[3], lon0, lat0)]);
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return { lon0, lat0, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2 };
}

// An airport's runways in plan, north up. `span` (metres) is the width of
// ground the box shows, so diagrams of one city share a scale. Runways are
// drawn half again as wide as they are, or they vanish at this scale.
type Label = { x: number; y: number; text: string };

// End labels sit just past each threshold; close parallels put theirs on top
// of each other, so overlapping labels are pushed apart until they clear.
function placeLabels(labels: Label[], font: number) {
  const width = (label: Label) => font * 0.62 * label.text.length + font * 0.4;
  for (let round = 0; round < 40; round++) {
    let moved = false;
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i], b = labels[j];
        const overlapX = (width(a) + width(b)) / 2 - Math.abs(a.x - b.x);
        const overlapY = font * 1.15 - Math.abs(a.y - b.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        moved = true;
        // Separate along the shorter way out, half each.
        if (overlapX < overlapY) {
          const push = (overlapX / 2 + 1) * (a.x <= b.x ? -1 : 1);
          a.x += push; b.x -= push;
        } else {
          const push = (overlapY / 2 + 1) * (a.y <= b.y ? -1 : 1);
          a.y += push; b.y -= push;
        }
      }
    }
    if (!moved) break;
  }
  return labels;
}

// An airport's runways in plan, north up. `span` (metres) is the width of
// ground the box shows, so diagrams of one city share a scale. Runways are
// drawn half again as wide as they are, or they vanish at this scale.
export default function AirportDiagram({ runways, span, label }: { runways: Runway[]; span: number; label: string }) {
  const { lon0, lat0, cx, cy } = extentOf(runways);
  const half = span / 2;
  const height = span * 0.62;
  const bar = span > 9000 ? 2000 : 1000;
  const font = span / 30;
  const gap = span * 0.04;
  const lines = runways.map((r) => {
    const [x1, y1] = project(r[0], r[1], lon0, lat0), [x2, y2] = project(r[2], r[3], lon0, lat0);
    const a: [number, number] = [x1 - cx, -(y1 - cy)], b: [number, number] = [x2 - cx, -(y2 - cy)];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { a, b, ux: (b[0] - a[0]) / length, uy: (b[1] - a[1]) / length, width: r[4], ends: [r[5], r[6]] };
  });
  const labels = placeLabels(lines.flatMap((line) => [
    { x: line.a[0] - line.ux * gap, y: line.a[1] - line.uy * gap, text: line.ends[0] },
    { x: line.b[0] + line.ux * gap, y: line.b[1] + line.uy * gap, text: line.ends[1] },
  ]), font);
  return (
    <svg className={styles.diagram} viewBox={`${-half} ${-height / 2} ${span} ${height}`} role="img" aria-label={label}>
      {lines.map((line, index) => (
        <line key={index} className={styles.runway} x1={line.a[0]} y1={line.a[1]} x2={line.b[0]} y2={line.b[1]} strokeWidth={Math.max(line.width * 1.5, span / 200)} />
      ))}
      {labels.map((item, index) => (
        <text key={index} className={styles.end} x={item.x} y={item.y} fontSize={font}>{item.text}</text>
      ))}
      <g className={styles.scale} transform={`translate(${half - bar - font * 0.4} ${height / 2 - font * 0.6})`}>
        <path d={`M0 ${-font * 0.35}V0H${bar}V${-font * 0.35}`} strokeWidth={span / 400} />
        <text x={bar / 2} y={-font * 0.7} fontSize={font * 0.9}>{bar / 1000} km</text>
      </g>
    </svg>
  );
}
