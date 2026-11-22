// The iOS globe's ground: one equirectangular texture of two distance fields,
// drawn from the same world-atlas 10m data as the web basemap.
//   R: signed distance to the coast (128 = shore, above = land)
//   G: distance to the nearest country border (0 = on the line)
// Distance fields keep shores and borders sharp at any zoom, and give the
// shader a soft halo for free. Written raw-deflated for Apple's Compression
// framework (COMPRESSION_ZLIB), with a small JSON header beside it.
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { deflateRawSync } from "node:zlib";
import { geoEquirectangular, geoPath } from "d3-geo";
import sharp from "sharp";
import { feature, mesh } from "topojson-client";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "ios/Flyprint/Resources");
const WIDTH = 8192, HEIGHT = 4096;
// How far, in texels, each field reaches before it saturates.
const SPREAD = { coast: 24, border: 6 };

const atlas = (name) => JSON.parse(require("node:fs").readFileSync(require.resolve(`world-atlas/${name}`), "utf8"));
const land10 = atlas("land-10m.json");
const countries10 = atlas("countries-10m.json");

const projection = geoEquirectangular().scale(WIDTH / (2 * Math.PI)).translate([WIDTH / 2, HEIGHT / 2]).precision(0.1);
const path = geoPath(projection);

async function rasterize(svgBody) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="100%" height="100%" fill="black"/>${svgBody}</svg>`;
  const { data } = await sharp(Buffer.from(svg), { limitInputPixels: false, unlimited: true }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return data;
}

// Felzenszwalb & Huttenlocher's exact squared Euclidean distance transform.
function distanceTransform(seed) {
  const INF = 1e20, n = Math.max(WIDTH, HEIGHT);
  const grid = new Float32Array(WIDTH * HEIGHT);
  for (let i = 0; i < grid.length; i++) grid[i] = seed[i] ? 0 : INF;
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n);
  const pass = (length) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < length; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < length; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
  };
  for (let x = 0; x < WIDTH; x++) {
    for (let y = 0; y < HEIGHT; y++) f[y] = grid[y * WIDTH + x];
    pass(HEIGHT);
    for (let y = 0; y < HEIGHT; y++) grid[y * WIDTH + x] = d[y];
  }
  for (let y = 0; y < HEIGHT; y++) {
    const row = y * WIDTH;
    for (let x = 0; x < WIDTH; x++) f[x] = grid[row + x];
    pass(WIDTH);
    for (let x = 0; x < WIDTH; x++) grid[row + x] = Math.sqrt(d[x]);
  }
  return grid;
}

const started = Date.now();
const landShape = await rasterize(`<path fill="white" fill-rule="evenodd" d="${path(feature(land10, land10.objects.land))}"/>`);
const borderLines = await rasterize(`<path fill="none" stroke="white" stroke-width="1" d="${path(mesh(countries10, countries10.objects.countries, (a, b) => a !== b))}"/>`);

const inside = new Uint8Array(WIDTH * HEIGHT), outside = new Uint8Array(WIDTH * HEIGHT), onBorder = new Uint8Array(WIDTH * HEIGHT);
for (let i = 0; i < inside.length; i++) {
  // d3's spherical fill of world-atlas land comes out as its complement here:
  // the white area is the sea.
  inside[i] = landShape[i] < 128 ? 1 : 0;
  outside[i] = 1 - inside[i];
  onBorder[i] = borderLines[i] >= 96 ? 1 : 0;
}
// Distance from water to the nearest land, and from land to the nearest water.
const toLand = distanceTransform(inside), toWater = distanceTransform(outside), toBorder = distanceTransform(onBorder);

const texels = Buffer.alloc(WIDTH * HEIGHT * 2);
let landCount = 0;
for (let i = 0; i < inside.length; i++) {
  // Half a texel either side of the boundary, so the shore sits at 0.
  const signed = inside[i] ? toWater[i] - 0.5 : -(toLand[i] - 0.5);
  texels[i * 2] = Math.max(0, Math.min(255, Math.round(128 + (signed / SPREAD.coast) * 127)));
  texels[i * 2 + 1] = Math.max(0, Math.min(255, Math.round((toBorder[i] / SPREAD.border) * 255)));
  landCount += inside[i];
}

await mkdir(out, { recursive: true });
const packed = deflateRawSync(texels, { level: 9 });
await writeFile(resolve(out, "globe-ground.bin"), packed);
await writeFile(resolve(out, "globe-ground.json"), `${JSON.stringify({ width: WIDTH, height: HEIGHT, format: "rg8", spread: SPREAD, compression: "zlib-raw", bytes: texels.length })}\n`);
console.log(`ground ${WIDTH}x${HEIGHT}: land ${(100 * landCount / inside.length).toFixed(1)}% of texels, ${(packed.length / 1e6).toFixed(1)} MB packed, ${((Date.now() - started) / 1000).toFixed(1)} s`);
