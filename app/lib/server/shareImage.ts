import { createHash } from "node:crypto";
import { geoDistance, geoEqualEarth, geoGraticule10, geoOrthographic, geoPath, type GeoProjection } from "d3-geo";
import sharp from "sharp";
import { feature } from "topojson-client";
import topology from "world-atlas/land-50m.json";
import type { Archive } from "../data";
import { enclosingCap, type LngLat } from "../geo";
import { airportFeatures, flightTracks, pathPoints } from "../network";
import { markSvg } from "../mark.mjs";
import { palette, toneColor } from "../palette";

// The picture a shared link unfurls into: the person's routes on the globe,
// drawn as the site draws them, with no words (the title and description
// carry those, in the language of whoever shares it).
const W = 1200, H = 630;
// vinext's type stubs declare sharp as unknown; this is the part used here.
const render = sharp as unknown as (input: Buffer) => { png(options: { compressionLevel: number }): { toBuffer(): Promise<Buffer> } };
const land = feature(topology as never, (topology as unknown as { objects: { land: never } }).objects.land);

function projectionFor(points: LngLat[]): { projection: GeoProjection; globe: boolean } {
  const cap = enclosingCap(points.length ? points : [[0, 20]]);
  // Routes that fit on one face of the planet go on the globe; ones that wrap
  // around it go flat, so no route hides on the far side.
  if (cap.radius < 1.25) {
    const radius = Math.min(H * 0.62, Math.max(H * 0.44, (H * 0.36) / Math.sin(Math.max(cap.radius, 0.12))));
    const projection = geoOrthographic().rotate([-cap.center[0], -cap.center[1] * 0.85]).scale(radius).translate([W / 2, H / 2 + Math.max(0, radius - H * 0.44) * 0.55]).clipAngle(90).precision(0.3);
    return { projection, globe: true };
  }
  const projection = geoEqualEarth().rotate([-cap.center[0], 0]).fitExtent([[40, 30], [W - 40, H - 30]], { type: "Sphere" }).precision(0.3);
  return { projection, globe: false };
}

export function shareSvg(archive: Archive) {
  const flights = archive.flights;
  const { projection, globe } = projectionFor(pathPoints(flights));
  const path = geoPath(projection);
  const tone = toneColor(archive.owner.tone);
  const tracks = flightTracks(flights).features.map((track) => path(track as never)).filter(Boolean).join(" ");
  const center = projection.invert?.([W / 2, H / 2]) as LngLat | undefined;
  const visible = (lngLat: LngLat) => !globe || !center || geoDistance(lngLat, center) < Math.PI / 2 - 0.02;
  const dots = airportFeatures(flights).features.map((airport) => {
    const lngLat = airport.geometry.coordinates as LngLat;
    const point = projection(lngLat);
    if (!point || !visible(lngLat)) return "";
    const tier = (airport.properties as { tier: number }).tier;
    return `<circle cx="${point[0].toFixed(1)}" cy="${point[1].toFixed(1)}" r="${tier === 1 ? 2.4 : tier === 2 ? 3.2 : 4.2}"/>`;
  }).join("");
  const sphere = path({ type: "Sphere" }) ?? "";
  const [cx, cy] = projection.translate();
  const radius = projection.scale();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="air" cx="${cx}" cy="${cy}" r="${radius * 1.12}" gradientUnits="userSpaceOnUse">
      <stop offset="0.86" stop-color="#6f8fbf" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#6f8fbf" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="shade" cx="${cx - radius * 0.35}" cy="${cy - radius * 0.4}" r="${radius * 1.5}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.35"/>
    </radialGradient>
    <filter id="halo" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3.2"/></filter>
    <clipPath id="frame"><rect width="${W}" height="${H}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="${palette.space}"/>
  <g clip-path="url(#frame)">
    ${globe ? `<circle cx="${cx}" cy="${cy}" r="${radius * 1.12}" fill="url(#air)"/>` : ""}
    <path d="${sphere}" fill="${palette.ocean}"/>
    <path d="${path(geoGraticule10()) ?? ""}" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="0.8"/>
    <path d="${path(land as never) ?? ""}" fill="${palette.land}"/>
    ${globe ? `<path d="${sphere}" fill="url(#shade)"/>` : ""}
    <path d="${tracks}" fill="none" stroke="${tone}" stroke-opacity="0.38" stroke-width="5" stroke-linecap="round" filter="url(#halo)"/>
    <path d="${tracks}" fill="none" stroke="${tone}" stroke-opacity="0.9" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${tracks}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="0.6" stroke-linecap="round"/>
    <g fill="#ffffff" fill-opacity="0.92" stroke="${palette.space}" stroke-width="1.4">${dots}</g>
  </g>
  <g transform="translate(44 ${H - 78}) scale(1.05)">${markSvg("mark")}</g>
</svg>`;
}

// What the picture is drawn from; a changed, added or removed flight changes it.
// DRAWING moves when the picture's design changes, so unfurlers fetch it again.
const DRAWING = 2;
export const shareVersion = (archive: Archive) => createHash("sha256")
  .update(`${DRAWING}|${archive.owner.tone}|${archive.flights.map((flight) => `${flight.id}:${flight.date}:${flight.origin}-${flight.destination}`).join(",")}`)
  .digest("base64url").slice(0, 12);

// Rendered once per state of the archive.
const rendered = new Map<string, Buffer>();
export async function shareImage(slug: string, archive: Archive) {
  const key = `${slug}:${shareVersion(archive)}`;
  const hit = rendered.get(key);
  if (hit) return hit;
  const png = await render(Buffer.from(shareSvg(archive))).png({ compressionLevel: 9 }).toBuffer();
  for (const old of rendered.keys()) if (old.startsWith(`${slug}:`)) rendered.delete(old);
  if (rendered.size > 64) rendered.delete(rendered.keys().next().value!);
  rendered.set(key, png);
  return png;
}
