import { geoInterpolate } from "d3-geo";
import type { LngLat } from "./geo";

const RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

// Where the sun stands for a place at an instant, in degrees: elevation above
// the horizon and azimuth clockwise from north. The low-precision solar
// position (Astronomical Almanac), good to about a hundredth of a degree.
export function sunAt(instant: number, [lng, lat]: LngLat) {
  const d = instant / 86_400_000 + 2440587.5 - 2451545;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const longitude = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const obliquity = (23.439 - 0.00000036 * d) * RAD;
  const ascension = Math.atan2(Math.cos(obliquity) * Math.sin(longitude), Math.cos(longitude));
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(longitude));
  const sidereal = (280.46061837 + 360.98564736629 * d) * RAD;
  const hour = sidereal + lng * RAD - ascension;
  const phi = lat * RAD;
  const elevation = Math.asin(Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.cos(hour));
  const azimuth = Math.atan2(-Math.cos(declination) * Math.sin(hour), Math.sin(declination) * Math.cos(phi) - Math.cos(declination) * Math.sin(phi) * Math.cos(hour));
  return { elevation: elevation / RAD, azimuth: ((azimuth / RAD) + 360) % 360 };
}

// The point on the ground where the sun stands overhead at an instant.
export function subsolar(instant: number): LngLat {
  const d = instant / 86_400_000 + 2440587.5 - 2451545;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const longitude = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const obliquity = (23.439 - 0.00000036 * d) * RAD;
  const ascension = Math.atan2(Math.cos(obliquity) * Math.sin(longitude), Math.cos(longitude));
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(longitude));
  const sidereal = (280.46061837 + 360.98564736629 * d) * RAD;
  const lng = ((((ascension - sidereal) / RAD) % 360) + 540) % 360 - 180;
  return [lng, declination / RAD];
}

// Cruise is reached about 25 minutes after take-off and left about 30 before
// landing; from up there the horizon sits below level, so the sun shows longer.
const CRUISE_KM = 11;
function altitudeAt(minute: number, total: number) {
  const climb = Math.min(25, total / 3), descent = Math.min(30, total / 3);
  if (minute < climb) return (CRUISE_KM * minute) / climb;
  if (minute > total - descent) return (CRUISE_KM * (total - minute)) / descent;
  return CRUISE_KM;
}
const horizonDip = (km: number) => Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + km)) / RAD;

const bearing = ([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) => {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lng2 - lng1) * RAD;
  return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD + 360) % 360;
};

export type SkyEvent = { kind: "sunrise" | "sunset"; minute: number; side: "left" | "right" };
// light: the sun's height above what the cabin can see, in degrees, along the flight.
export type Sky = { light: { at: number; degrees: number }[]; events: SkyEvent[] };

export function skyAlong(from: LngLat, to: LngLat, departAt: number, minutes: number, samples = 72): Sky {
  const place = geoInterpolate(from, to);
  const light: Sky["light"] = [];
  const events: SkyEvent[] = [];
  // Refraction lifts the sun's disc by about half a degree at the horizon.
  const visible = (t: number) => {
    const minute = t * minutes;
    const sun = sunAt(departAt + minute * 60_000, place(t) as LngLat);
    return { degrees: sun.elevation + 0.833 + horizonDip(altitudeAt(minute, minutes)), azimuth: sun.azimuth };
  };
  let previous: { t: number; degrees: number } | null = null;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const { degrees } = visible(t);
    light.push({ at: t, degrees });
    if (previous && Math.sign(previous.degrees) !== Math.sign(degrees) && degrees !== 0) {
      let lo = previous.t, hi = t;
      for (let step = 0; step < 18; step++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(visible(mid).degrees) === Math.sign(previous.degrees)) lo = mid; else hi = mid;
      }
      const at = (lo + hi) / 2;
      const here = place(at) as LngLat, ahead = place(Math.min(1, at + 0.01)) as LngLat, behind = place(Math.max(0, at - 0.01)) as LngLat;
      const heading = at < 0.99 ? bearing(here, ahead) : bearing(behind, here);
      const relative = (visible(at).azimuth - heading + 360) % 360;
      events.push({ kind: degrees > 0 ? "sunrise" : "sunset", minute: Math.round(at * minutes), side: relative < 180 ? "right" : "left" });
    }
    previous = { t, degrees };
  }
  return { light, events };
}

// Night a faint blue, the horizon a warm glow, day a pale warm white.
const LIGHT: [number, [number, number, number, number]][] = [
  [-12, [120, 150, 200, 0.24]],
  [-4, [150, 140, 196, 0.38]],
  [0, [236, 150, 112, 0.72]],
  [5, [246, 204, 150, 0.82]],
  [14, [240, 234, 218, 0.86]],
];

export function lightRGBA(degrees: number): [number, number, number, number] {
  const clamped = Math.max(LIGHT[0][0], Math.min(LIGHT.at(-1)![0], degrees));
  let i = 1;
  while (i < LIGHT.length - 1 && clamped > LIGHT[i][0]) i++;
  const [d0, c0] = LIGHT[i - 1], [d1, c1] = LIGHT[i];
  const t = (clamped - d0) / (d1 - d0 || 1);
  return c0.map((value, k) => value + (c1[k] - value) * t) as [number, number, number, number];
}

export function lightColor(degrees: number) {
  const [r, g, b, a] = lightRGBA(degrees);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(2)})`;
}

export const skyGradient = (sky: Sky) =>
  `linear-gradient(90deg, ${sky.light.map((point) => `${lightColor(point.degrees)} ${(point.at * 100).toFixed(1)}%`).join(", ")})`;
