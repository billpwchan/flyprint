import { geoGraticule10, geoPath, geoProjection, type GeoPermissibleObjects } from "d3-geo";
import { feature, mesh } from "topojson-client";
import { bowedTrack, enclosingCap, fromVector, toVector, type LngLat, type Vec3 } from "../../lib/geo";

// The night globe for a share card, drawn once at print size: the same ground,
// airport lights and arcs of light as the iOS app's still (GlobePrinter.swift),
// in a 2D canvas. Card space is points on a 360 × 480 card; the canvas is
// SCALE times that.

export const CARD = { width: 360, height: 480, scale: 4, margin: 20 };
const FOV = (22 * Math.PI) / 180;
const FOCAL = CARD.height / 2 / Math.tan(FOV / 2);
// No nearer than where the ground's own detail still holds.
const NEAREST = 1.6;

export type ArcSpec = { from: LngLat; to: LngLat; bow: number; color: string; alpha: number; width: number };
export type DotSpec = { code: string; at: LngLat; radius: number; alpha: number };
export type Camera = { center: LngLat; distance: number };
export type Still = {
  arcs: ArcSpec[];
  dots: DotSpec[];
  camera: Camera;
  // Where on the card the point the camera looks at lands.
  middle: [number, number];
  // One trip or flight, light gathering toward where it went; or many without.
  directed: boolean;
  glow: number;
  glowGain: number;
};

const COLORS = {
  ground: "#07080b",
  ocean: [11, 15, 20],
  // A step lighter than on screen, so a coast survives a chat app's compression.
  land: [31, 39, 49],
  shore: [150, 182, 224],
  rim: [111, 143, 184],
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(...a) || 1));

export const liftOf = (angle: number) => (0.16 * angle) / (1 + 0.7 * angle);

// A flight's arc as drawn: its bowed track, risen off the ground at the middle.
export function arcPath(from: LngLat, to: LngLat, bow: number): Vec3[] {
  const track = bowedTrack(from, to, bow);
  if (track.length < 2) return [];
  const lift = liftOf(Math.acos(Math.min(1, Math.max(-1, dot(track[0], track.at(-1)!)))));
  const last = track.length - 1;
  return track.map((point, index) => scale(point, 1 + lift * Math.sin((Math.PI * index) / last)));
}

// The camera looking at the planet's centre from `distance` radii out over
// `center`, north up; projects card points and knows what the planet hides.
export function viewOf(camera: Camera, middle: [number, number]) {
  const eyeDir = toVector(camera.center);
  const eye = scale(eyeDir, camera.distance);
  const forward = scale(eyeDir, -1);
  let right = cross(forward, [0, 1, 0]);
  if (Math.hypot(...right) < 1e-6) right = [1, 0, 0];
  right = unit(right);
  const up = cross(right, forward);
  const project = (p: Vec3): [number, number] | null => {
    const rel: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const z = dot(rel, forward);
    if (z <= 1e-6) return null;
    // Hidden when the line of sight meets the planet before the point.
    const length = Math.hypot(...rel);
    const dir = scale(rel, 1 / length);
    const b = dot(eye, dir), c = dot(eye, eye) - 1, disc = b * b - c;
    if (disc > 0) {
      const near = -b - Math.sqrt(disc);
      if (near > 0 && near < length - 1e-4) return null;
    }
    return [middle[0] + (FOCAL * dot(rel, right)) / z, middle[1] - (FOCAL * dot(rel, up)) / z];
  };
  const disc = FOCAL * Math.tan(Math.asin(1 / camera.distance));
  return { project, disc };
}

// The same view as a d3 projection (the vertical perspective), for the ground.
function groundProjection(camera: Camera, middle: [number, number]) {
  const p = camera.distance;
  const raw = (lambda: number, phi: number): [number, number] => {
    const cosc = Math.cos(phi) * Math.cos(lambda);
    const k = (p - 1) / (p - cosc);
    return [k * Math.cos(phi) * Math.sin(lambda), k * Math.sin(phi)];
  };
  return geoProjection(raw)
    .scale(FOCAL / (p - 1))
    .translate(middle)
    .rotate([-camera.center[0], -camera.center[1]])
    .clipAngle((Math.acos(1 / p) * 180) / Math.PI - 1e-6)
    .precision(0.15);
}

// MARK: Framing

// Looks at a set of flights so that as much of their length as possible is
// in view: a region close up when it fits on one face of the planet, else the
// whole disc turned to where most of the flying was.
export function frame(arcs: ArcSpec[], middle: [number, number], reach: number): Camera {
  const points: LngLat[] = [];
  const weighted: [Vec3, number][] = [];
  const lifted: Vec3[] = [];
  for (const arc of arcs) {
    const path = arcPath(arc.from, arc.to, arc.bow);
    if (path.length < 2) continue;
    lifted.push(...path);
    const step = Math.max(1, Math.floor(path.length / 16));
    const length = Math.acos(Math.min(1, Math.max(-1, dot(unit(path[0]), unit(path.at(-1)!)))));
    for (let index = 0; index < path.length; index += step) {
      const u = unit(path[index]);
      points.push(fromVector(u));
      weighted.push([u, length / (Math.floor(path.length / step) + 1)]);
    }
    points.push(fromVector(unit(path.at(-1)!)));
  }
  const half = (Math.tan(FOV / 2) * reach) / (CARD.height / 2);
  const whole = Math.sqrt(1 + 1 / (half * half));
  if (!points.length) return { center: [110, 25], distance: whole };
  const cap = enclosingCap(points);
  if (cap.radius < 1.12) {
    const radius = Math.min(cap.radius * 1.06 + 0.03 + liftOf(cap.radius * 2) * 0.5, Math.PI / 2);
    const center: LngLat = [cap.center[0], Math.max(-70, Math.min(75, cap.center[1]))];
    const camera = { center, distance: Math.max(NEAREST, Math.min(whole, Math.cos(radius) + Math.sin(radius) / half)) };
    // Then fit what is drawn, arcs at their height included, to the band, with
    // room at the sides and ends for the names.
    const room = [CARD.width - 120, reach * 2 - 36];
    for (let round = 0; round < 5; round++) {
      const { project } = viewOf(camera, middle);
      const seen = lifted.map(project).filter((point): point is [number, number] => !!point);
      if (!seen.length) break;
      const xs = seen.map((point) => point[0]), ys = seen.map((point) => point[1]);
      const k = Math.min(room[0] / Math.max(1, Math.max(...xs) - Math.min(...xs)), room[1] / Math.max(1, Math.max(...ys) - Math.min(...ys)));
      if (Math.abs(k - 1) < 0.03) break;
      camera.distance = Math.max(NEAREST, Math.min(whole, 1 + (camera.distance - 1) / k));
    }
    return camera;
  }
  const sum = weighted.reduce<Vec3>((total, [p, w]) => [total[0] + p[0] * w, total[1] + p[1] * w, total[2] + p[2] * w], [0, 1e-6, 0]);
  const mean = unit(sum);
  const horizon = 1 / whole;
  let best: [Vec3, number] = [mean, -1];
  for (let lat = -50; lat <= 72; lat += 3) {
    for (let lng = -180; lng < 180; lng += 3) {
      const c = toVector([lng, lat]);
      let seen = 0;
      for (const [p, w] of weighted) if (dot(p, c) > horizon + 0.04) seen += w;
      const score = seen + 0.02 * dot(c, mean);
      if (score > best[1]) best = [c, score];
    }
  }
  return { center: fromVector(best[0]), distance: whole };
}

// MARK: Drawing

type World = { land: GeoPermissibleObjects; coast: GeoPermissibleObjects; borders: GeoPermissibleObjects; lights: [number, number, number][] };
let world: Promise<World> | null = null;

export function loadWorld() {
  world ??= Promise.all([import("world-atlas/countries-50m.json"), import("./lights.json")]).then(([atlas, lights]) => {
    const topology = ((atlas as { default?: unknown }).default ?? atlas) as { type: "Topology"; objects: { countries: never } };
    const countries = topology.objects.countries;
    return {
      land: feature(topology as never, countries) as unknown as GeoPermissibleObjects,
      coast: mesh(topology as never, countries, (a: unknown, b: unknown) => a === b) as unknown as GeoPermissibleObjects,
      borders: mesh(topology as never, countries, (a: unknown, b: unknown) => a !== b) as unknown as GeoPermissibleObjects,
      lights: ((lights as { default?: unknown }).default ?? lights) as [number, number, number][],
    };
  });
  // A failed load (a deploy mid-session, a dropped connection) is tried again next time.
  world.catch(() => { world = null; });
  return world;
}

const rgba = ([r, g, b]: number[], a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;

// Pixels per point on this canvas: 4 for a printed card, 3 for a film's frames.
export const pixelsOf = (ctx: CanvasRenderingContext2D) => ctx.getTransform().a;

// Light from the camera: full where the ground faces it, quieter toward the
// edge; a ray through a point a share `s` of the disc's radius out meets the
// ground facing the camera by this much.
function facingAt(s: number, distance: number) {
  const angle = Math.atan(s * Math.tan(Math.asin(1 / distance)));
  const b = distance * Math.cos(angle), c = distance * distance - 1;
  const t = b - Math.sqrt(Math.max(0, b * b - c));
  const hit: Vec3 = [t * Math.sin(angle), 0, distance - t * Math.cos(angle)];
  const toEye = unit([-hit[0], 0, distance - hit[2]]);
  return Math.max(0, dot(hit, toEye));
}

export async function drawStill(ctx: CanvasRenderingContext2D, still: Still) {
  const view = await drawGround(ctx, still);
  drawArcs(ctx, still, view);
  drawDots(ctx, still, view);
  return view;
}

// The planet alone: ocean, land, the air around it and the world's airports.
export async function drawGround(ctx: CanvasRenderingContext2D, still: Pick<Still, "camera" | "middle">) {
  const { land, coast, borders, lights } = await loadWorld();
  const px = pixelsOf(ctx);
  const { camera, middle } = still;
  const view = viewOf(camera, middle);
  const projection = groundProjection(camera, middle);
  const path = geoPath(projection, ctx);
  const [cx, cy] = middle;
  const r = view.disc;

  ctx.save();
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, 0, CARD.width, CARD.height);

  // Air around the planet: a thin glow that thins out with height.
  const air = ctx.createRadialGradient(cx, cy, r * 0.98, cx, cy, r * 1.5);
  for (const h of [0, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5]) {
    const glow = Math.exp(-h * 16) * 0.42 + Math.exp(-h * 4) * 0.42 * 0.25;
    air.addColorStop(Math.min(1, (h + 0.02) / 0.52), rgba(COLORS.rim, Math.min(1, glow)));
  }
  ctx.fillStyle = air;
  ctx.fillRect(0, 0, CARD.width, CARD.height);

  // Ground: ocean, land, a faint wash off the shore, the coast, the borders.
  ctx.beginPath();
  path({ type: "Sphere" });
  ctx.fillStyle = rgba(COLORS.ocean, 1);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  path({ type: "Sphere" });
  ctx.clip();
  ctx.beginPath();
  path(coast);
  ctx.save();
  ctx.shadowColor = rgba(COLORS.shore, 0.5);
  ctx.shadowBlur = 5 * px;
  ctx.strokeStyle = rgba(COLORS.shore, 0.06);
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  path(land);
  ctx.fillStyle = rgba(COLORS.land, 1);
  ctx.fill();
  ctx.beginPath();
  path(coast);
  ctx.strokeStyle = rgba(COLORS.shore, 0.42);
  ctx.lineWidth = 0.35;
  ctx.stroke();
  ctx.beginPath();
  path(borders);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 0.3;
  ctx.stroke();
  ctx.beginPath();
  path(geoGraticule10());
  ctx.strokeStyle = "rgba(170, 196, 230, 0.025)";
  ctx.lineWidth = 0.3;
  ctx.stroke();

  // Lit from the camera, and the edge of the disc catching the air.
  const shade = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  const rim = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (let i = 0; i <= 16; i++) {
    const s = i / 16;
    const facing = facingAt(s, camera.distance);
    shade.addColorStop(s, `rgba(0, 0, 0, ${(1 - (0.42 + 0.58 * Math.pow(facing, 0.6))).toFixed(3)})`);
    rim.addColorStop(s, rgba(COLORS.rim, Math.pow(1 - facing, 3) * 0.42 * 0.8));
  }
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, CARD.width, CARD.height);
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, CARD.width, CARD.height);

  // The world's airports as faint warm lights, under the person's flights.
  const sprite = lightSprite();
  ctx.globalCompositeOperation = "lighter";
  for (const [lng, lat, level] of lights) {
    const point = view.project(scale(toVector([lng, lat]), 1.001));
    if (!point) continue;
    const [radius, alpha] = [[0.55, 0.09], [0.7, 0.16], [0.85, 0.27], [1, 0.38]][level];
    const size = radius * 3.2;
    ctx.globalAlpha = alpha * 0.45 * 1.6;
    ctx.drawImage(sprite, point[0] - size / 2, point[1] - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.restore();
  return view;
}

type View = ReturnType<typeof viewOf>;

// The airports flown from and to; `lit` says how far each has come on (its
// light, and how much larger it shows as it first lights).
export function drawDots(ctx: CanvasRenderingContext2D, still: Still, view: View, lit?: (spec: DotSpec) => [number, number]) {
  const px = pixelsOf(ctx);
  for (const spec of still.dots) {
    const [alpha, swell] = lit ? lit(spec) : [1, 1];
    if (alpha <= 0) continue;
    const point = view.project(scale(toVector(spec.at), 1.001));
    if (!point) continue;
    const radius = spec.radius * swell;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowColor = "rgba(255, 255, 255, 0.6)";
    ctx.shadowBlur = radius * 2 * px;
    ctx.beginPath();
    ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(238, 240, 242, ${spec.alpha * alpha})`;
    ctx.fill();
    ctx.restore();
  }
}

let sprite: HTMLCanvasElement | null = null;
function lightSprite() {
  if (sprite) return sprite;
  sprite = document.createElement("canvas");
  sprite.width = sprite.height = 32;
  const c = sprite.getContext("2d")!;
  const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255, 204, 133, 1)");
  g.addColorStop(0.3, "rgba(255, 204, 133, 0.55)");
  g.addColorStop(1, "rgba(255, 204, 133, 0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
  return sprite;
}

// Each flight as light, as the app's globe draws it: a fine core, mostly
// added to what is under it, in a soft halo. A directed flight brightens
// toward where it landed, and every flight is quieter right at its airports,
// where all the lines from a hub meet.
const erf = (x: number) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x < 0 ? -y : y;
};
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// How bright a line is at each point along it (0 at take-off, 1 at landing).
export const levelOf = (still: Pick<Still, "directed">) => (t: number) => (still.directed ? 0.38 + 0.62 * t : 1) * (0.22 + 0.78 * smooth(0, 0.1, Math.min(t, 1 - t)));

// A flight's line as the card sees it, worked out once: each point where it
// lands on the card (null behind the planet), and how much of its light is
// left there toward the planet's edge (a year's lines fade more than one
// flight's) or gone past it, where it would hang in the air.
export type Traced = { arc: ArcSpec; points: ([number, number] | null)[]; limb: number[] };
export function traceArcs(still: Still, { project, disc }: View): Traced[] {
  const edge = still.directed ? 0.35 : 1;
  const limb = (point: [number, number]) => {
    const outline = Math.hypot(point[0] - still.middle[0], point[1] - still.middle[1]) / disc;
    return (1 - smooth(0.97, 1.03, outline)) * (1 - 0.55 * edge + 0.55 * edge * (1 - smooth(0.7, 0.97, outline)));
  };
  return still.arcs.map((arc) => {
    const points = arcPath(arc.from, arc.to, arc.bow).map(project);
    return { arc, points, limb: points.map((point) => point ? limb(point) : 0) };
  });
}

// One line into a layer, as far as `reach` of the way along it, each stretch
// at the level `level` gives it; pieces meet end to end, so nothing is lit
// twice. Returns where the line has got to and the box it was drawn in.
export function strokeArc(l: CanvasRenderingContext2D, { arc, points, limb }: Traced, level: (t: number) => number, reach = 1, alpha = arc.alpha) {
  const last = points.length - 1;
  const end = Math.min(1, reach) * last;
  if (last < 1 || end <= 0) return { head: null, box: null };
  l.strokeStyle = arc.color;
  l.lineWidth = arc.width;
  let piece: [number, number][] = [], at = -1;
  let head: [number, number] | null = null;
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const flush = () => {
    if (piece.length > 1) {
      l.globalAlpha = alpha * at;
      l.beginPath();
      l.moveTo(piece[0][0], piece[0][1]);
      for (const point of piece.slice(1)) l.lineTo(point[0], point[1]);
      l.stroke();
    }
  };
  for (let index = 0; index <= Math.ceil(end); index++) {
    let point = points[index];
    let t = index / last;
    // The tip, part of the way to the next point.
    if (index > end) {
      const before = points[index - 1], share = end - (index - 1);
      point = point && before ? [before[0] + (point[0] - before[0]) * share, before[1] + (point[1] - before[1]) * share] : null;
      t = end / last;
    }
    head = point;
    if (!point) { flush(); piece = []; at = -1; continue; }
    box[0] = Math.min(box[0], point[0]); box[1] = Math.min(box[1], point[1]);
    box[2] = Math.max(box[2], point[0]); box[3] = Math.max(box[3], point[1]);
    const here = level(t) * limb[index];
    if (at >= 0 && Math.abs(here - at) > 0.02) {
      const before = piece.at(-1);
      flush();
      piece = before ? [before] : [];
      at = here;
    }
    if (at < 0) at = here;
    piece.push(point);
  }
  flush();
  return { head, box: box[0] <= box[2] ? box as [number, number, number, number] : null };
}

// A layer of line cores (in pixels, the same size as the card's canvas) laid
// on the card as light: its halo, as bright at a line's middle as the app's
// (glowGain) whatever the line's width, then the core itself. `box`, in
// pixels, keeps the work to where the lines are.
export function lightArcs(ctx: CanvasRenderingContext2D, layer: HTMLCanvasElement, still: Still, box?: [number, number, number, number]) {
  if (!still.arcs.length) return;
  const width = still.arcs[0].width, sigma = still.glow * 0.42;
  const color = still.arcs[0].color;
  const px = pixelsOf(ctx);
  const [x, y, w, h] = box ?? [0, 0, layer.width, layer.height];
  if (w <= 0 || h <= 0) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Only the layer's blurred shadow is drawn: the layer itself is put far off the card.
  const away = 4000;
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = color;
  ctx.shadowBlur = 2 * sigma * px;
  ctx.shadowOffsetX = away;
  let gain = still.glowGain / Math.max(0.05, erf(width / (2 * Math.SQRT2 * sigma)));
  while (gain > 0.001) {
    ctx.globalAlpha = Math.min(1, gain);
    ctx.drawImage(layer, x, y, w, h, x - away, y, w, h);
    gain -= 1;
  }
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  // The core: 45% laid over what is under it, 55% added to it.
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.45;
  ctx.drawImage(layer, x, y, w, h, x, y, w, h);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.55;
  ctx.drawImage(layer, x, y, w, h, x, y, w, h);
  ctx.restore();
}

// A canvas the size of `ctx`'s, drawing in the same points.
export function layerLike(ctx: CanvasRenderingContext2D) {
  const layer = document.createElement("canvas");
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const l = layer.getContext("2d")!;
  l.setTransform(ctx.getTransform());
  return { layer, l };
}

// Every flight's line into one layer, lines adding where they cross, then
// laid on the card as light.
function drawArcs(ctx: CanvasRenderingContext2D, still: Still, view: View) {
  if (!still.arcs.length) return;
  const { layer, l } = layerLike(ctx);
  l.globalCompositeOperation = "lighter";
  l.lineCap = "butt";
  l.lineJoin = "round";
  const level = levelOf(still);
  for (const traced of traceArcs(still, view)) strokeArc(l, traced, level);
  lightArcs(ctx, layer, still);
  layer.width = layer.height = 0;
}

// How a point projects on a card, for placing names.
export function projector(still: Pick<Still, "camera" | "middle">) {
  const { project } = viewOf(still.camera, still.middle);
  return (at: LngLat) => project(scale(toVector(at), 1.001));
}
