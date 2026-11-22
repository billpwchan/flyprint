import { geoInterpolate } from "d3-geo";

export type LngLat = [number, number];
export type Bounds = [LngLat, LngLat];

export const EARTH_CIRCUMFERENCE_KM = 40_075;
export const MOON_DISTANCE_KM = 384_400;

// Longitudes are unwrapped so a path that crosses the antimeridian stays
// continuous (e.g. 170 → 190) instead of jumping across the map.
export function greatCircle(from: LngLat, to: LngLat, segments = 64): LngLat[] {
  const interpolate = geoInterpolate(from, to);
  const points: LngLat[] = [];
  let previous: number | null = null;
  for (let index = 0; index <= segments; index++) {
    const [lng, lat] = interpolate(index / segments) as LngLat;
    let unwrapped = lng;
    if (previous !== null) {
      while (unwrapped - previous > 180) unwrapped -= 360;
      while (unwrapped - previous < -180) unwrapped += 360;
    }
    previous = unwrapped;
    points.push([unwrapped, lat]);
  }
  return points;
}

// Smallest longitude window that holds every point, so a trans-Pacific trip
// frames across the Pacific rather than across the whole world.
export function boundsOf(points: LngLat[]): Bounds | null {
  if (!points.length) return null;
  const lats = points.map(([, lat]) => lat);
  const lngs = points.map(([lng]) => ((lng % 360) + 540) % 360 - 180).sort((a, b) => a - b);
  let gapStart = lngs.at(-1)!, gapSize = lngs[0] + 360 - lngs.at(-1)!;
  for (let index = 1; index < lngs.length; index++) {
    const gap = lngs[index] - lngs[index - 1];
    if (gap > gapSize) { gapSize = gap; gapStart = lngs[index - 1]; }
  }
  const west = gapStart + gapSize - (gapStart + gapSize > 180 ? 360 : 0);
  let east = gapStart;
  if (east < west) east += 360;
  return [[west, Math.min(...lats)], [east, Math.max(...lats)]];
}

export function centroid(points: LngLat[]): LngLat {
  if (!points.length) return [114, 22];
  let x = 0, y = 0, z = 0;
  for (const [lng, lat] of points) {
    const phi = (lat * Math.PI) / 180, lambda = (lng * Math.PI) / 180;
    x += Math.cos(phi) * Math.cos(lambda);
    y += Math.cos(phi) * Math.sin(lambda);
    z += Math.sin(phi);
  }
  const lng = Math.atan2(y, x), hyp = Math.hypot(x, y);
  return [(lng * 180) / Math.PI, (Math.atan2(z, hyp) * 180) / Math.PI];
}

export function angularDistance(a: LngLat, b: LngLat) {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad, dLng = (b[0] - a[0]) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// The smallest spherical cap holding every point (Bădoiu–Clarkson iteration):
// its centre is where a globe camera must look to keep all of them in view.
export function enclosingCap(points: LngLat[]): { center: LngLat; radius: number } {
  const toVector = ([lng, lat]: LngLat) => {
    const l = (lng * Math.PI) / 180, p = (lat * Math.PI) / 180;
    return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  };
  const normalize = (v: number[]) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return v.map((x) => x / n); };
  const toLngLat = (v: number[]): LngLat => [(Math.atan2(v[1], v[0]) * 180) / Math.PI, (Math.asin(Math.max(-1, Math.min(1, v[2]))) * 180) / Math.PI];
  const vectors = points.map(toVector);
  let center = toLngLat(normalize(vectors.reduce((sum, v) => sum.map((x, i) => x + v[i]), [0, 0, 0])));
  for (let step = 1; step <= 120; step++) {
    let far = vectors[0], farDistance = -1;
    for (let index = 0; index < points.length; index++) {
      const distance = angularDistance(center, points[index]);
      if (distance > farDistance) { farDistance = distance; far = vectors[index]; }
    }
    const c = toVector(center);
    center = toLngLat(normalize(c.map((x, i) => x + (far[i] - x) / (step + 1))));
  }
  const radius = Math.max(...points.map((point) => angularDistance(center, point)));
  return { center, radius };
}

export type Vec3 = [number, number, number];

// Points on the unit sphere in the axes MapLibre's globe matrix uses: z
// through (0°, 0°), x through 90°E, y through the North Pole.
export const toVector = ([lng, lat]: LngLat): Vec3 => {
  const x = (lng * Math.PI) / 180, y = (lat * Math.PI) / 180;
  return [Math.sin(x) * Math.cos(y), Math.sin(y), Math.cos(x) * Math.cos(y)];
};

export const fromVector = ([x, y, z]: Vec3): LngLat => [(Math.atan2(x, z) * 180) / Math.PI, (Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI];

// A flight's track over the ground: the great circle between two airports,
// pushed sideways at the middle by `bow` (a share of its length) and meeting
// it again at both ends. A positive bow lies right of the direction of travel,
// so a route flown both ways passes as two lanes. Returns unit vectors.
export function bowedTrack(from: LngLat, to: LngLat, bow: number): Vec3[] {
  const a = toVector(from), b = toVector(to);
  const angle = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  // Dense enough that a short hop stays smooth when the camera closes in on it.
  const steps = Math.min(128, Math.max(48, Math.ceil(angle * 60)));
  const sin = Math.sin(angle);
  // b × a points right of travel from a toward b (forward × up).
  const cross: Vec3 = [b[1] * a[2] - b[2] * a[1], b[2] * a[0] - b[0] * a[2], b[0] * a[1] - b[1] * a[0]];
  const length = Math.hypot(...cross);
  const right: Vec3 = length > 1e-9 ? [cross[0] / length, cross[1] / length, cross[2] / length] : [0, 0, 0];
  const track: Vec3[] = [];
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    const wa = sin < 1e-6 ? 1 - t : Math.sin((1 - t) * angle) / sin;
    const wb = sin < 1e-6 ? t : Math.sin(t * angle) / sin;
    const p: Vec3 = [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
    const aside = bow * angle * Math.sin(Math.PI * t);
    const c = Math.cos(aside), s = Math.sin(aside);
    track.push([p[0] * c + right[0] * s, p[1] * c + right[1] * s, p[2] * c + right[2] * s]);
  }
  return track;
}
