import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import GeoJSONVT from "geojson-vt";
import { feature, mesh } from "topojson-client";

const require = createRequire(import.meta.url);
const vtpbf = require("vt-pbf");

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "public/basemap");
const stamp = resolve(out, "VERSION");
// Keep in sync with app/lib/basemap.ts.
const maxZoom = 7, chunkZoom = 3;
const version = `ne10m-z${maxZoom}-c${chunkZoom}-v5`;

if (!process.argv.includes("--force")) {
  try {
    if ((await readFile(stamp, "utf8")).trim() === version) process.exit(0);
  } catch { /* build below */ }
}

const atlas = (name) => JSON.parse(require("node:fs").readFileSync(require.resolve(`world-atlas/${name}`), "utf8"));
const land10 = atlas("land-10m.json");
const countries10 = atlas("countries-10m.json");

// topojson follows d3's spherical winding (clockwise exteriors); vector tiles
// expect RFC 7946 (counter-clockwise exteriors), otherwise the sea gets filled.
const ringArea = (ring) => {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return area / 2;
};
const orient = (ring, counterClockwise) => (ringArea(ring) > 0) === counterClockwise ? ring : [...ring].reverse();
// Rings that cross the antimeridian jump from 180 to -180; read flat, that jump
// becomes an edge across the whole map. Make them continuous (e.g. Chukotka at
// 190°) and let geojson-vt wrap them. Rings around a pole keep their planar
// closure along their southernmost latitude, which lies outside Web Mercator.
const unwrap = (ring) => {
  const open = ring.slice(0, -1);
  let net = 0;
  for (let i = 0; i < open.length; i++) {
    const delta = open[(i + 1) % open.length][0] - open[i][0];
    if (delta > 180) net -= 360; else if (delta < -180) net += 360;
  }
  if (net !== 0 || !open.some((point, i) => i && Math.abs(point[0] - open[i - 1][0]) > 180)) return ring;
  const anchor = Math.max(0, open.findIndex(([lng]) => Math.abs(lng) < 170));
  const rotated = [...open.slice(anchor), ...open.slice(0, anchor)];
  const out = [rotated[0]];
  let previous = rotated[0][0];
  for (const [lng, lat] of rotated.slice(1)) {
    let next = lng;
    while (next - previous > 180) next -= 360;
    while (next - previous < -180) next += 360;
    out.push([next, lat]);
    previous = next;
  }
  out.push(out[0]);
  return out;
};
const rewind = (geometry) => {
  const polygon = (rings) => rings.map((ring, index) => orient(unwrap(ring), index === 0));
  if (geometry.type === "Polygon") return { ...geometry, coordinates: polygon(geometry.coordinates) };
  if (geometry.type === "MultiPolygon") return { ...geometry, coordinates: geometry.coordinates.map(polygon) };
  return geometry;
};
const landFeature = feature(land10, land10.objects.land);
const land = { type: "FeatureCollection", features: (landFeature.features ?? [landFeature]).map((item) => ({ ...item, geometry: rewind(item.geometry) })) };
// Interior borders only: the coast is drawn by the land fill, so excluding
// exterior arcs keeps the shoreline free of a second stroke.
const borders = mesh(countries10, countries10.objects.countries, (a, b) => a !== b);

const options = { maxZoom, indexMaxZoom: maxZoom, indexMaxPoints: 0, tolerance: 2.2, extent: 4096, buffer: 48 };
const layers = {
  land: new GeoJSONVT(land, options),
  boundary: new GeoJSONVT({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: borders }] }, options),
};

// Tiles are packed into chunks (one per level up to chunkZoom, then one per
// chunkZoom ancestor) and served through a MapLibre protocol: ocean tiles cost
// no request, never surface as 404s, and a close zoom fetches only its region.
// Chunk layout: uint32 header length, JSON header {"x/y":[offset,length]}, tile bytes.
const chunks = new Map();
const chunkName = (z, x, y) => z <= chunkZoom ? `${z}` : `${z}-${x >> (z - chunkZoom)}-${y >> (z - chunkZoom)}`;
for (let z = 0; z <= maxZoom; z++) {
  const size = 2 ** z;
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const tiles = {};
      for (const [name, index] of Object.entries(layers)) {
        const tile = index.getTile(z, x, y);
        if (tile && tile.features.length) tiles[name] = tile;
      }
      if (!Object.keys(tiles).length) continue;
      const name = chunkName(z, x, y);
      const chunk = chunks.get(name) ?? { entries: {}, buffers: [], offset: 0 };
      const buffer = Buffer.from(vtpbf.fromGeojsonVt(tiles, { version: 2 }));
      chunk.entries[`${x}/${y}`] = [chunk.offset, buffer.length];
      chunk.buffers.push(buffer);
      chunk.offset += buffer.length;
      chunks.set(name, chunk);
    }
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
let total = 0;
for (const [name, chunk] of chunks) {
  const header = Buffer.from(JSON.stringify(chunk.entries));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(header.length);
  const body = Buffer.concat([length, header, ...chunk.buffers]);
  await writeFile(resolve(out, `${name}.bin`), body);
  total += body.length;
}
await writeFile(resolve(out, "manifest.json"), JSON.stringify([...chunks.keys()]));
await writeFile(stamp, `${version}\n`);
console.log(`Basemap packed: ${chunks.size} chunks, ${(total / 1024).toFixed(0)} KB (z0–${maxZoom}).`);
