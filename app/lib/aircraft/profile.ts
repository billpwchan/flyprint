// Side views of airliners, drawn from measured outlines.
//
// Each family is one template in metres: x aft from the nose, y up from the
// fuselage centreline. Outlines were measured from scale three-view drawings
// and normalised to the published dimensions; curves pass through the measured
// points. A longer or shorter variant of a family adds or removes cabin in two
// plugs, one ahead of the wing and one behind it, so the nose, wing and tail
// keep their shapes.

type Pt = readonly [number, number];
type Device = "fence" | "sharklet" | "winglet" | "blended" | "scimitar" | "raked" | "curved" | "none";

type Engine = {
  x: number; len: number; dia: number; y: number;
  core: number; coreDia: number; plug: number;
  chevrons?: boolean; flat?: number;
};

type Wing = { root: Pt; tip: Pt; chordRoot: number; chordTip: number; device: Device; canoes: number };

type Cockpit = { from: number; to: number; bottom: readonly [number, number]; cap: number; inset: number; dividers: number[] };

type Template = {
  ref: number;
  depth: number;
  plugs: readonly [number, number];
  share: number;
  nose: Pt[];
  topTo: number;
  tailTop: Pt[];
  tailBottom: Pt[];
  belly: number;
  fin: { le: Pt[]; tip: readonly [Pt, Pt]; te: Pt; rudder?: readonly [Pt, Pt] };
  stab: Pt[];
  fairing: Pt[];
  wing: Wing;
  engine: Engine;
  doors: Door[];
  windows: { y: number; pitch: number; from: number; to: number; w: number; h: number };
  cockpit: Cockpit;
};

type Door = { x: number; w: number; h: number; y: number };

// `doors` replaces the family's doors, at the variant's own stations.
export type Variant = {
  family: keyof typeof families;
  length: number;
  engine?: Partial<Engine>;
  device?: Device;
  fin?: number;
  doors?: Door[];
};

// --- families ---------------------------------------------------------------

const A330: Template = {
  ref: 63.69, depth: 5.64, plugs: [12, 42], share: 0.5,
  nose: [[7.5, -2.82], [6, -2.75], [5, -2.62], [4, -2.44], [3, -2.21], [2, -1.86], [1.5, -1.63], [1, -1.4], [0.5, -1.06], [0.22, -0.76], [0.04, -0.46], [0, -0.33], [0.05, -0.12], [0.25, 0.11], [0.5, 0.33], [1, 0.55], [1.5, 0.88], [2, 1.38], [2.5, 1.65], [3, 1.87], [3.5, 2.08], [4, 2.24], [5, 2.46], [6, 2.66], [7, 2.77], [8.5, 2.82]],
  topTo: 59.8,
  tailTop: [[59.8, 2.82], [61, 2.64], [62, 2.57], [63, 2.49], [63.69, 2.42]],
  tailBottom: [[63.69, 1.99], [63, 1.82], [62, 1.55], [61, 1.28], [60, 0.96], [59, 0.69], [58, 0.32], [57, -0.01], [56, -0.39], [55, -0.77], [54, -1.09], [53, -1.47], [52, -1.75], [51, -2.0], [50, -2.21], [49, -2.42], [48, -2.58], [47, -2.69], [46, -2.78], [44.5, -2.82]],
  belly: -2.82,
  fin: {
    le: [[49.6, 2.82], [50.6, 2.88], [51.5, 3.1], [52.2, 3.42], [53, 3.95], [54, 4.88], [57.3, 8.11]],
    tip: [[60.6, 11.33], [63.35, 11.33]], te: [60.25, 2.82], rudder: [[58.07, 2.82], [62.45, 11.33]],
  },
  stab: [[56.2, 1.55], [57.2, 1.02], [58.8, 0.86], [60.8, 1.42], [62.6, 2.16], [60.4, 2.27], [58, 2.05], [56.8, 1.86]],
  fairing: [[21.3, -2.45], [22.6, -1.42], [25.5, -0.72], [28.6, -0.4], [38.6, -1.25], [40, -2.1], [39.4, -3.1], [37.6, -3.47], [30, -3.52], [24.5, -3.42], [21.9, -3.0]],
  wing: { root: [22.2, -1.4], tip: [40.3, 1.24], chordRoot: 11.0, chordTip: 2.5, device: "winglet", canoes: 4 },
  engine: { x: 20.45, len: 5.1, dia: 3.07, y: -2.93, core: 2.2, coreDia: 1.8, plug: 1.2 },
  doors: [{ x: 5.0, w: 1.07, h: 2.0, y: -0.38 }, { x: 17.4, w: 1.07, h: 2.0, y: -0.38 }, { x: 36.0, w: 0.6, h: 1.05, y: 0.3 }, { x: 50.6, w: 1.07, h: 2.0, y: -0.38 }],
  windows: { y: 0.8, pitch: 0.533, from: 6.9, to: 49.6, w: 0.24, h: 0.34 },
  cockpit: { from: 1.6, to: 3.5, bottom: [0.62, 0.62], cap: 1.5, inset: 0.22, dividers: [0.36, 0.7] },
};

const A320: Template = {
  ref: 37.57, depth: 3.96, plugs: [9, 23], share: 0.615,
  nose: [[5.6, -1.98], [4, -1.98], [3, -1.95], [2, -1.85], [1.5, -1.78], [1, -1.65], [0.5, -1.42], [0.2, -1.12], [0.03, -0.86], [0, -0.74], [0.05, -0.5], [0.25, -0.22], [0.5, 0.0], [1, 0.26], [1.5, 0.59], [2, 1.09], [2.5, 1.42], [3, 1.62], [3.5, 1.78], [4, 1.88], [4.5, 1.95], [5.5, 1.98]],
  topTo: 34.8,
  tailTop: [[34.8, 1.98], [35.5, 1.82], [36.5, 1.66], [37.57, 1.45]],
  tailBottom: [[37.57, 0.91], [37, 0.73], [36, 0.4], [35, 0.07], [34, -0.23], [33, -0.56], [32, -0.89], [31, -1.19], [30, -1.45], [29, -1.65], [28, -1.81], [27, -1.91], [25.5, -1.98]],
  belly: -1.98,
  fin: {
    le: [[28.6, 1.98], [29.5, 2.12], [30.2, 2.5], [30.7, 2.95], [31.3, 3.7], [33, 5.8]],
    tip: [[34.6, 7.7], [36.75, 7.7]], te: [35.15, 1.98], rudder: [[33.7, 1.98], [35.7, 7.7]],
  },
  stab: [[31.7, 0.74], [32.5, 0.36], [34, 0.12], [35.6, 0.45], [37.2, 1.35], [35.5, 1.42], [33.6, 1.25], [32.3, 1.0]],
  fairing: [[10.4, -1.75], [11.3, -1.0], [13.1, -0.55], [14.8, -0.35], [20.9, -0.9], [21.8, -1.6], [21.1, -2.25], [19.8, -2.42], [14.4, -2.45], [12.0, -2.36], [10.8, -2.1]],
  wing: { root: [12.2, -1.15], tip: [21.2, 0.62], chordRoot: 6.6, chordTip: 1.6, device: "fence", canoes: 3 },
  engine: { x: 11.15, len: 3.5, dia: 2.25, y: -2.22, core: 1.9, coreDia: 1.3, plug: 0.75 },
  doors: [{ x: 4.6, w: 0.81, h: 1.85, y: -0.62 }, { x: 14.15, w: 0.5, h: 0.95, y: 0.0 }, { x: 15.0, w: 0.5, h: 0.95, y: 0.0 }, { x: 29.25, w: 0.81, h: 1.85, y: -0.62 }],
  windows: { y: 0.46, pitch: 0.533, from: 5.95, to: 28.9, w: 0.22, h: 0.32 },
  cockpit: { from: 1.45, to: 3.45, bottom: [0.32, 0.32], cap: 0.93, inset: 0.2, dividers: [0.33, 0.68] },
};

const B737: Template = {
  ref: 39.47, depth: 3.97, plugs: [9, 24], share: 0.5,
  nose: [[6.2, -1.98], [5, -1.96], [4.5, -1.91], [3.5, -1.78], [2.5, -1.65], [2, -1.56], [1.5, -1.38], [1, -1.24], [0.5, -0.97], [0.2, -0.75], [0.03, -0.56], [0, -0.45], [0.06, -0.28], [0.25, -0.12], [0.5, 0.08], [1, 0.33], [1.5, 0.53], [2, 0.98], [2.5, 1.22], [3, 1.42], [3.5, 1.58], [4, 1.7], [4.5, 1.77], [5, 1.88], [6, 1.95], [7, 1.99]],
  topTo: 36.3,
  tailTop: [[36.3, 1.99], [37.4, 1.93], [38.5, 1.82], [39.3, 1.7]],
  tailBottom: [[39.3, 1.42], [38.5, 0.6], [38, 0.42], [37, 0.11], [36, -0.2], [35, -0.52], [34, -0.79], [33, -1.02], [32, -1.25], [31, -1.44], [30, -1.63], [29, -1.78], [28, -1.86], [26.5, -1.97]],
  belly: -1.99,
  fin: {
    le: [[28.4, 1.99], [30.5, 2.55], [32.6, 3.2], [33.15, 3.45], [33.5, 3.8], [35.5, 6.0]],
    tip: [[37.7, 8.4], [39.4, 8.4]], te: [37.95, 1.99], rudder: [[36.4, 1.99], [38.55, 7.75]],
  },
  stab: [[34.85, 1.2], [35.4, 0.92], [37.0, 1.02], [38.6, 1.5], [39.6, 2.18], [38.4, 2.2], [36.6, 1.75], [35.3, 1.35]],
  fairing: [[14.0, -1.82], [14.8, -1.1], [16.2, -0.66], [17.6, -0.48], [22.0, -0.95], [22.8, -1.6], [22.3, -2.22], [21.0, -2.4], [17.0, -2.42], [15.0, -2.34], [14.3, -2.1]],
  wing: { root: [14.0, -1.0], tip: [23.2, 0.71], chordRoot: 6.4, chordTip: 1.3, device: "blended", canoes: 3 },
  engine: { x: 13.3, len: 3.6, dia: 1.92, y: -1.69, core: 1.0, coreDia: 1.05, plug: 0.45, flat: 0.12 },
  doors: [{ x: 4.45, w: 0.86, h: 1.83, y: -0.4 }, { x: 16.9, w: 0.5, h: 0.97, y: 0.0 }, { x: 17.75, w: 0.5, h: 0.97, y: 0.0 }, { x: 31.8, w: 0.76, h: 1.83, y: -0.4 }],
  windows: { y: 0.5, pitch: 0.53, from: 6.2, to: 31.2, w: 0.23, h: 0.33 },
  cockpit: { from: 1.75, to: 3.1, bottom: [0.42, 0.42], cap: 0.9, inset: 0.2, dividers: [0.4, 0.72] },
};

const B777: Template = {
  ref: 73.86, depth: 6.19, plugs: [14, 50.5], share: 0.526,
  nose: [[8.4, -3.1], [7, -3.04], [6, -2.97], [5, -2.85], [4, -2.64], [3, -2.38], [2, -2.04], [1, -1.63], [0.5, -1.33], [0.2, -1.05], [0.03, -0.78], [0, -0.6], [0.06, -0.38], [0.25, -0.16], [0.5, 0.04], [1, 0.33], [1.5, 0.72], [2, 1.1], [2.5, 1.49], [3, 1.68], [3.5, 1.88], [4, 2.07], [5, 2.3], [6, 2.55], [7, 2.75], [8, 2.92], [9.5, 3.06], [10.5, 3.1]],
  topTo: 69.4,
  tailTop: [[69.4, 3.1], [70.6, 2.62], [71.6, 2.36], [72.8, 2.24], [73.7, 2.22]],
  tailBottom: [[73.86, 2.2], [73.8, 1.25], [73.5, 0.88], [73, 0.72], [72, 0.45], [70, -0.03], [68, -0.5], [66, -0.97], [64, -1.42], [62, -1.84], [60, -2.3], [58, -2.73], [56.6, -3.0], [55, -3.1]],
  belly: -3.1,
  fin: {
    le: [[57.0, 3.1], [59.3, 3.32], [61.0, 3.75], [62.1, 4.25], [63.3, 5.6]],
    tip: [[70.3, 12.53], [73.0, 12.53]], te: [69.5, 3.1], rudder: [[67.0, 3.1], [72.0, 12.53]],
  },
  stab: [[63.6, 1.92], [64.8, 1.26], [67.0, 1.12], [70.4, 1.78], [73.4, 2.62], [70.6, 2.84], [67.4, 2.62], [64.8, 2.36]],
  fairing: [[25.0, -2.75], [26.6, -1.66], [30.2, -0.8], [34.0, -0.5], [43.8, -1.4], [45.0, -2.4], [44.2, -3.42], [41.8, -3.78], [34, -3.84], [28.4, -3.7], [25.6, -3.25]],
  wing: { root: [29.2, -1.2], tip: [49.0, 1.62], chordRoot: 11.5, chordTip: 2.2, device: "raked", canoes: 4 },
  engine: { x: 24.7, len: 5.8, dia: 4.3, y: -2.55, core: 2.9, coreDia: 2.3, plug: 1.2 },
  doors: [{ x: 6.0, w: 1.07, h: 1.95, y: -0.5 }, { x: 16.6, w: 1.07, h: 1.95, y: -0.5 }, { x: 32.6, w: 1.07, h: 1.95, y: -0.5 }, { x: 46.2, w: 1.07, h: 1.95, y: -0.5 }, { x: 59.8, w: 1.07, h: 1.95, y: -0.5 }],
  windows: { y: 0.5, pitch: 0.516, from: 7.6, to: 61.4, w: 0.25, h: 0.38 },
  cockpit: { from: 1.7, to: 2.95, bottom: [0.45, 0.45], cap: 1.05, inset: 0.22, dividers: [0.45] },
};

const B787: Template = {
  ref: 56.72, depth: 5.92, plugs: [16, 39], share: 0.5,
  nose: [[6.3, -2.96], [5, -2.85], [4, -2.71], [3.5, -2.65], [3, -2.58], [2.5, -2.51], [2, -2.44], [1.5, -2.31], [1, -2.11], [0.5, -1.85], [0.2, -1.6], [0.03, -1.32], [0, -1.18], [0.06, -0.92], [0.25, -0.7], [0.5, -0.46], [1, 0.05], [1.5, 0.49], [2, 0.87], [2.5, 1.25], [3, 1.62], [3.5, 1.87], [4, 2.12], [4.5, 2.31], [5, 2.43], [6, 2.68], [7, 2.82], [8, 2.92], [9.2, 2.96]],
  topTo: 52.4,
  tailTop: [[52.4, 2.96], [53.6, 2.62], [54.8, 2.34], [55.9, 2.14], [56.62, 2.06]],
  tailBottom: [[56.72, 1.98], [56.4, 1.72], [56, 1.5], [55, 1.12], [54, 0.62], [53, 0.0], [52, -0.6], [51, -0.91], [50, -1.22], [49, -1.47], [48, -1.71], [47, -1.96], [46, -2.14], [45, -2.32], [44, -2.44], [43, -2.56], [42, -2.68], [41, -2.8], [39.5, -2.93], [38, -2.96]],
  belly: -2.96,
  fin: {
    le: [[40.4, 2.96], [42.6, 3.2], [44.4, 3.62], [45.7, 3.9], [47.3, 5.4]],
    tip: [[54.15, 11.66], [55.85, 11.66]], te: [52.55, 2.96], rudder: [[50.9, 2.96], [54.95, 11.66]],
  },
  stab: [[47.4, 0.62], [48.4, 0.18], [50.2, 0.05], [53, 0.55], [56.6, 1.95], [53.6, 1.75], [50.5, 1.35], [48.4, 1.0]],
  fairing: [[18.0, -2.6], [19.4, -1.56], [22.6, -0.9], [25.8, -0.62], [36.4, -1.42], [37.4, -2.3], [36.7, -3.25], [34.4, -3.6], [26, -3.62], [21.0, -3.5], [18.6, -3.1]],
  wing: { root: [22.2, -1.15], tip: [37.4, 1.85], chordRoot: 10.2, chordTip: 1.9, device: "raked", canoes: 3 },
  engine: { x: 16.0, len: 6.1, dia: 3.6, y: -2.74, core: 2.6, coreDia: 2.05, plug: 1.1, chevrons: true },
  doors: [{ x: 5.2, w: 1.07, h: 2.05, y: -0.55 }, { x: 14.2, w: 1.07, h: 2.05, y: -0.55 }, { x: 31.6, w: 1.07, h: 2.05, y: -0.55 }, { x: 42.9, w: 1.07, h: 2.05, y: -0.55 }],
  windows: { y: 0.76, pitch: 0.56, from: 7.6, to: 42.2, w: 0.28, h: 0.46 },
  cockpit: { from: 1.45, to: 3.67, bottom: [0.55, 0.35], cap: 1.05, inset: 0.22, dividers: [0.3, 0.56, 0.8] },
};

// No scale drawing to measure: built on the 787 (the same smooth nose and tail
// architecture), set to the A350's depth and length and checked against a
// side-on photograph for door, engine and fin positions.
const A350: Template = {
  ref: 66.8, depth: 6.09, plugs: [16, 44], share: 0.55,
  nose: B787.nose.map(([x, y]) => [x * 1.08, y * (6.09 / 5.92)] as Pt),
  topTo: 62.4,
  tailTop: [[62.4, 3.05], [63.8, 2.74], [65.0, 2.5], [66.1, 2.32], [66.7, 2.25]],
  tailBottom: [[66.8, 1.9], [66.5, 1.62], [66, 1.38], [65, 0.98], [64, 0.5], [63, -0.06], [62, -0.62], [61, -0.98], [60, -1.3], [59, -1.56], [58, -1.8], [57, -2.04], [56, -2.24], [55, -2.42], [54, -2.56], [53, -2.7], [52, -2.82], [51, -2.94], [49.5, -3.04], [48, -3.05]],
  belly: -3.05,
  fin: {
    le: [[49.4, 3.05], [51.4, 3.32], [53.2, 3.8], [54.4, 4.2], [56.0, 5.8]],
    tip: [[63.6, 11.6], [66.1, 11.6]], te: [62.6, 3.05], rudder: [[60.6, 3.05], [64.9, 11.6]],
  },
  stab: [[56.6, 0.72], [57.6, 0.24], [59.6, 0.1], [62.6, 0.66], [66.4, 2.0], [63.2, 1.86], [60, 1.45], [57.6, 1.1]],
  fairing: [[21.4, -2.7], [22.9, -1.6], [26.4, -0.92], [29.8, -0.64], [41.6, -1.46], [42.6, -2.36], [41.9, -3.3], [39.6, -3.68], [30, -3.72], [24.6, -3.6], [22.0, -3.2]],
  wing: { root: [25.6, -1.2], tip: [43.4, 2.05], chordRoot: 11.6, chordTip: 1.6, device: "curved", canoes: 4 },
  engine: { x: 18.2, len: 6.4, dia: 3.75, y: -2.86, core: 2.7, coreDia: 2.1, plug: 1.15 },
  doors: [{ x: 5.9, w: 1.07, h: 2.05, y: -0.55 }, { x: 19.6, w: 1.07, h: 2.05, y: -0.55 }, { x: 38.6, w: 1.07, h: 2.05, y: -0.55 }, { x: 53.4, w: 1.07, h: 2.05, y: -0.55 }],
  windows: { y: 0.76, pitch: 0.533, from: 7.8, to: 52.8, w: 0.26, h: 0.42 },
  cockpit: { from: 1.5, to: 4.05, bottom: [0.62, 0.45], cap: 1.28, inset: 0.24, dividers: [0.32, 0.6, 0.84] },
};

export const families = { A330, A320, B737, B777, B787, A350 } as const;

// --- geometry ----------------------------------------------------------------

const r = (value: number) => Math.round(value * 1000) / 1000;
const P = ([x, y]: Pt) => `${r(x)},${r(-y)}`;

// A smooth curve through points (Catmull-Rom as cubic Béziers). `before` and
// `after` set the direction it leaves the first point and reaches the last.
function through(points: Pt[], before?: Pt, after?: Pt) {
  const all = [before ?? points[0], ...points, after ?? points[points.length - 1]];
  let d = "";
  for (let i = 1; i < all.length - 2; i++) {
    const [p0, p1, p2, p3] = [all[i - 1], all[i], all[i + 1], all[i + 2]];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${P(c1)} ${P(c2)} ${P(p2)}`;
  }
  return d;
}
const closed = (points: Pt[]) => {
  const n = points.length;
  let d = `M${P(points[0])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [points[(i - 1 + n) % n], points[i], points[(i + 1) % n], points[(i + 2) % n]];
    d += ` C${P([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${P([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${P(p2)}`;
  }
  return `${d} Z`;
};
const poly = (points: Pt[], close = true) => `M${points.map(P).join(" L")}${close ? " Z" : ""}`;
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Height of a polyline at x (points in x order either way).
function along(points: Pt[], x: number) {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  if (x <= sorted[0][0]) return sorted[0][1];
  for (let i = 1; i < sorted.length; i++) if (x <= sorted[i][0]) {
    const [a, b] = [sorted[i - 1], sorted[i]];
    return a[1] + ((x - a[0]) / (b[0] - a[0] || 1)) * (b[1] - a[1]);
  }
  return sorted[sorted.length - 1][1];
}

// Painted back to front; each `body` part is filled to hide what is behind
// it. `half` is the fuselage's half depth, for light that falls across it.
export type Drawing = {
  length: number;
  top: number;
  bottom: number;
  half: number;
  parts: { d: string; kind: "body" | "line" | "detail" | "glass" | "window" }[];
};

function stretcher(t: Template, length: number) {
  const extra = length - t.ref;
  const fwd = extra * t.share, aft = extra - fwd;
  const [a, b] = t.plugs;
  return (x: number) => x <= a ? x : x <= b ? x + fwd : x + fwd + aft;
}

function nacelle(e: Engine) {
  const { x, len, dia, y } = e;
  const R = dia / 2, under = R * (1 - (e.flat ?? 0));
  const top: Pt[] = [[x, y + R * 0.86], [x + len * 0.12, y + R * 0.99], [x + len * 0.35, y + R], [x + len * 0.75, y + R * 0.97], [x + len, y + R * 0.86]];
  const bottom: Pt[] = [[x + len, y - under * 0.86], [x + len * 0.75, y - under * 0.97], [x + len * 0.35, y - under], [x + len * 0.12, y - under * 0.99], [x, y - under * 0.86]];
  const shell = `M${P(top[0])}${through(top, [x - 0.4, y + R * 0.7], [x + len + 0.5, y + R * 0.8])} L${P(bottom[0])}${through(bottom, [x + len + 0.5, y - under * 0.8], [x - 0.4, y - under * 0.7])} C${P([x - R * 0.2, y - under * 0.6])} ${P([x - R * 0.2, y + R * 0.6])} ${P(top[0])} Z`;
  const cx = x + len, cr = e.coreDia / 2;
  const core = poly([[cx - 0.2, y + cr], [cx + e.core * 0.55, y + cr * 0.86], [cx + e.core, y + cr * 0.55], [cx + e.core, y - cr * 0.55], [cx + e.core * 0.55, y - cr * 0.86], [cx - 0.2, y - cr]]);
  const px = cx + e.core, pr = cr * 0.42;
  const plug = `M${P([px - 0.05, y + pr])} C${P([px + e.plug * 0.5, y + pr])} ${P([px + e.plug * 0.8, y + pr * 0.3])} ${P([px + e.plug, y])} C${P([px + e.plug * 0.8, y - pr * 0.3])} ${P([px + e.plug * 0.5, y - pr])} ${P([px - 0.05, y - pr])} Z`;
  const lip = `M${P([x + len * 0.09, y + R * 0.97])} C${P([x + len * 0.03, y + R * 0.4])} ${P([x + len * 0.03, y - under * 0.4])} ${P([x + len * 0.09, y - under * 0.97])}`;
  let rim = "";
  if (e.chevrons) {
    const n = 7; const pts: Pt[] = [];
    for (let i = 0; i <= n * 2; i++) pts.push([cx - (i % 2 ? 0.32 : 0), y + R * 0.86 - (i / (n * 2)) * (R * 0.86 + under * 0.86)]);
    rim = poly(pts, false);
  }
  return { shell, core, plug, lip, rim };
}

// Wingtip devices, in metres at the tip.
function tipDevice(w: Wing, tip: Pt): string | null {
  const [x, y] = tip, c = w.chordTip;
  switch (w.device) {
    case "sharklet": return `M${P([x + c * 0.05, y])} C${P([x + c * 0.35, y + 0.12])} ${P([x + c * 0.75, y + 1.0])} ${P([x + c * 1.05, y + 2.25])} L${P([x + c * 1.4, y + 2.3])} C${P([x + c * 1.2, y + 1.2])} ${P([x + c * 1.08, y + 0.4])} ${P([x + c, y])} Z`;
    case "winglet": return poly([[x + 0.15, y - 0.02], [x + 1.9, y + 1.15], [x + 2.75, y + 1.15], [x + 2.2, y + 0.12]]);
    case "blended": return `M${P([x + c * 0.1, y])} C${P([x + c * 0.55, y + 0.12])} ${P([x + c * 0.8, y + 1.0])} ${P([x + c * 0.95, y + 2.35])} L${P([x + c * 1.3, y + 2.4])} C${P([x + c * 1.25, y + 1.4])} ${P([x + c * 1.2, y + 0.5])} ${P([x + c * 1.02, y])} Z`;
    case "scimitar": return `M${P([x + c * 0.1, y])} C${P([x + c * 0.6, y + 0.15])} ${P([x + c * 0.95, y + 1.0])} ${P([x + c * 1.25, y + 2.45])} L${P([x + c * 1.5, y + 2.45])} C${P([x + c * 1.35, y + 1.2])} ${P([x + c * 1.2, y + 0.4])} ${P([x + c * 1.02, y])} L${P([x + c * 1.35, y - 0.85])} L${P([x + c * 1.12, y - 0.88])} L${P([x + c * 0.7, y - 0.05])} Z`;
    case "curved": return `M${P([x + c * 0.05, y])} C${P([x + c * 0.7, y + 0.05])} ${P([x + c * 1.05, y + 0.8])} ${P([x + c * 1.3, y + 2.1])} L${P([x + c * 1.62, y + 2.15])} C${P([x + c * 1.45, y + 1.0])} ${P([x + c * 1.25, y + 0.3])} ${P([x + c, y])} Z`;
    case "fence": return poly([[x + c * 0.2, y], [x + c * 0.78, y + 0.82], [x + c * 1.08, y + 0.84], [x + c * 1.0, y], [x + c * 1.06, y - 0.52], [x + c * 0.82, y - 0.5]]);
    case "raked": case "none": return null;
  }
}

export function draw(v: Variant): Drawing {
  const t = families[v.family];
  const X = stretcher(t, v.length);
  const S = (p: Pt): Pt => [X(p[0]), p[1]];
  const s = t.depth / 5.64;
  const parts: Drawing["parts"] = [];
  const add = (d: string, kind: Drawing["parts"][number]["kind"]) => parts.push({ d, kind });
  const half = t.depth / 2;
  const L = v.length;

  // Fuselage.
  const nose = t.nose.map(S);
  const tailTop = t.tailTop.map(S), tailBottom = t.tailBottom.map(S);
  const outline = `M${P(nose[0])}${through(nose, [nose[0][0] + 1, nose[0][1]], [nose[nose.length - 1][0] + 1, nose[nose.length - 1][1]])}`
    + ` L${P(tailTop[0])}${through(tailTop, [tailTop[0][0] - 1, tailTop[0][1]])}`
    + ` L${P(tailBottom[0])}${through(tailBottom, undefined, [tailBottom[tailBottom.length - 1][0] - 1, tailBottom[tailBottom.length - 1][1]])} Z`;
  add(outline, "body");
  add(outline, "line");

  // Fin and rudder. The fin's fill reaches into the fuselage so its root
  // covers the top line and the two read as one surface.
  const finScale = v.fin ?? 1;
  const fy = (p: Pt): Pt => [p[0], half + (p[1] - half) * finScale];
  const le = t.fin.le.map((p) => S(fy(p)));
  const finTipLe = S(fy(t.fin.tip[0])), finTipTe = S(fy(t.fin.tip[1]));
  const te = S(t.fin.te);
  const finEdge = `M${P(le[0])}${through([...le, finTipLe], [le[0][0] - 2, le[0][1]], [finTipLe[0] + 1, finTipLe[1] + 1])} L${P(finTipTe)} L${P(te)}`;
  add(`${finEdge} L${P([te[0], half - 0.3])} L${P([le[0][0], half - 0.3])} Z`, "body");
  add(finEdge, "line");
  if (t.fin.rudder) add(poly([S(fy(t.fin.rudder[0])), S(fy(t.fin.rudder[1]))], false), "detail");

  // Cockpit glazing follows the nose contour.
  const c = t.cockpit;
  const upper = t.nose.filter((p) => p[1] > 0);
  const edge: Pt[] = [];
  for (let i = 0; i <= 8; i++) { const x = c.from + ((c.to - c.from) * i) / 8; edge.push([x, Math.min(along(upper, x) - c.inset, c.cap)]); }
  const glass: Pt[] = [[c.from + 0.12, c.bottom[0]], ...edge.slice(1), [c.to, c.bottom[1]]];
  add(poly(glass.map(S)), "glass");
  for (const f of c.dividers) {
    const x = c.from + (c.to - c.from) * f;
    add(poly([S([x, c.bottom[0] + (c.bottom[1] - c.bottom[0]) * f]), S([x, Math.min(along(upper, x) - c.inset, c.cap)])], false), "detail");
  }

  // Doors and windows.
  const doors = v.doors ?? t.doors.map((d) => ({ ...d, x: X(d.x + d.w / 2) - d.w / 2 }));
  for (const d of doors) {
    const k = Math.min(0.18, d.w / 4);
    add(`M${P([d.x + k, d.y + d.h])} L${P([d.x + d.w - k, d.y + d.h])} Q${P([d.x + d.w, d.y + d.h])} ${P([d.x + d.w, d.y + d.h - k])} L${P([d.x + d.w, d.y + k])} Q${P([d.x + d.w, d.y])} ${P([d.x + d.w - k, d.y])} L${P([d.x + k, d.y])} Q${P([d.x, d.y])} ${P([d.x, d.y + k])} L${P([d.x, d.y + d.h - k])} Q${P([d.x, d.y + d.h])} ${P([d.x + k, d.y + d.h])} Z`, "detail");
  }
  const w = t.windows;
  let windows = "";
  // Spaced along the finished cabin, so a plug neither crowds nor gaps them.
  for (let cx = X(w.from); cx <= X(w.to); cx += w.pitch) {
    if (doors.some((d) => cx > d.x - 0.3 && cx < d.x + d.w + 0.3)) continue;
    const k = w.w / 2, top = w.y + w.h / 2, bot = w.y - w.h / 2;
    windows += `M${P([cx - k, bot + k])} L${P([cx - k, top - k])} Q${P([cx - k, top])} ${P([cx, top])} Q${P([cx + k, top])} ${P([cx + k, top - k])} L${P([cx + k, bot + k])} Q${P([cx + k, bot])} ${P([cx, bot])} Q${P([cx - k, bot])} ${P([cx - k, bot + k])} Z`;
  }
  add(windows, "window");

  // Horizontal tail, near side.
  add(closed(t.stab.map(S)), "body");
  add(closed(t.stab.map(S)), "line");

  // Wing-to-body fairing, wing, flap-track fairings.
  add(closed(t.fairing.map(S)), "body");
  add(closed(t.fairing.map(S)), "line");
  const wing = t.wing;
  const root = S(wing.root), tip = S(wing.tip);
  const rootTe: Pt = [root[0] + wing.chordRoot, root[1]], tipTe: Pt = [tip[0] + wing.chordTip, tip[1]];
  const canoes: string[] = [];
  for (let i = 1; i <= wing.canoes; i++) {
    const at = lerp(rootTe, tipTe, 0.12 + (0.74 * (i - 1)) / Math.max(1, wing.canoes - 1));
    const len = 4.2 * s * (1 - 0.18 * (i - 1) / Math.max(1, wing.canoes)), dep = 0.5 * s;
    const x0 = at[0] - len * 0.72, x1 = at[0] + len * 0.28, y = at[1] - 0.05;
    canoes.push(`M${P([x0, y])} C${P([x0, y - dep * 0.8])} ${P([x0 + len * 0.3, y - dep])} ${P([x0 + len * 0.55, y - dep])} C${P([x0 + len * 0.8, y - dep])} ${P([x1, y - dep * 0.45])} ${P([x1 + 0.2 * s, y + 0.02])} L${P([x0 + len * 0.2, y + 0.08])} C${P([x0 + 0.05, y + 0.08])} ${P([x0, y + 0.04])} ${P([x0, y])} Z`);
  }
  for (const d of canoes) { add(d, "body"); add(d, "line"); }
  const wingShape = poly([[root[0] - 0.3, root[1] - 0.25 * s], root, tip, tipTe, rootTe]);
  add(wingShape, "body");
  add(poly([[root[0] + 2.2 * s, root[1] + ((tip[1] - root[1]) / (tip[0] - root[0])) * 2.2 * s], tip, tipTe, lerp(rootTe, tipTe, 0.18)], false), "line");
  add(poly([lerp(root, tip, 0.18).map((v, i) => v - (i ? 0.28 * s : 0)) as unknown as Pt, [tip[0] + 0.25, tip[1] - 0.26 * s]], false), "detail");
  const device = tipDevice({ ...wing, device: v.device ?? wing.device }, tip);
  if (device) { add(device, "body"); add(device, "line"); }

  // Engine on its pylon.
  const e: Engine = { ...t.engine, ...v.engine, x: X(v.engine?.x ?? t.engine.x) };
  const n = nacelle(e);
  const pylon = `M${P([e.x + e.len * 0.45, e.y + e.dia / 2 - 0.05])} L${P([e.x + e.len * 0.62, e.y + e.dia / 2 + 0.32 * s])} L${P([e.x + e.len + e.core * 0.7, e.y + e.coreDia / 2 + 0.3 * s])} C${P([e.x + e.len + e.core * 1.05, e.y + e.coreDia / 2 + 0.2 * s])} ${P([e.x + e.len + e.core * 1.15, e.y + e.coreDia * 0.3])} ${P([e.x + e.len + e.core * 1.1, e.y + e.coreDia * 0.18])} L${P([e.x + e.len * 0.9, e.y + e.coreDia * 0.3])} Z`;
  add(pylon, "body");
  add(pylon, "line");
  add(n.core, "body"); add(n.core, "line");
  add(n.plug, "body"); add(n.plug, "line");
  add(n.shell, "body"); add(n.shell, "line");
  add(n.lip, "detail");
  if (n.rim) add(n.rim, "detail");

  const finTop = half + (t.fin.tip[0][1] - half) * finScale;
  const lowest = Math.min(t.belly, ...t.fairing.map((p) => p[1]), e.y - e.dia / 2);
  return { length: L, top: finTop, bottom: lowest, half, parts };
}
