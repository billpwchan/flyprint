import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { dataDir } from "./db";
import { airport } from "./gazetteer";
import { airportOfMetro, cityOf, metroOf } from "../places";

// A city as it looks from above, for the places the site names: Sentinel-2
// cloudless 2024 by EOX (Copernicus Sentinel data, CC BY-NC-SA 4.0), framed
// on the city's centre, not its airport, which can lie 60 km out. The centre
// comes from Open-Meteo's gazetteer (GeoNames). The server asks once per city
// and keeps the picture, so neither service learns who looked.

export type ImageKind = "wide" | "square";
const SIZES: Record<ImageKind, { width: number; height: number; span: number }> = {
  // The span is the ground across the picture's width, in metres.
  wide: { width: 1200, height: 640, span: 16_000 },
  square: { width: 256, height: 256, span: 20_000 },
};
export const IMAGE_VERSION = 1;

const tiles = () => process.env.FLYPRINT_IMAGERY_UPSTREAM || "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g";
const gazetteer = () => process.env.FLYPRINT_GAZETTEER_UPSTREAM || "https://geocoding-api.open-meteo.com/v1/search";
// The city's centre must lie this near its airport to be the right city.
const REACH_KM = 90;
// A name that found nothing is asked again after a week.
const RETRY = 7 * 86_400_000;
// New pictures a day, whatever the asks: each costs EOX four to fifteen tiles.
const MAKES_PER_DAY = 1000;
// Pictures made at once: each holds its tiles and a canvas in memory, on a
// small shared host.
const AT_ONCE = 3;

let store: DatabaseSync | null = null;
function cache() {
  if (store) return store;
  mkdirSync(join(dataDir(), "imagery"), { recursive: true });
  store = new DatabaseSync(join(dataDir(), "imagery.sqlite"));
  store.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS centres (
      metro TEXT PRIMARY KEY,
      lon REAL,
      lat REAL,
      fetched INTEGER NOT NULL
    );`);
  return store;
}

let budget = { day: "", made: 0 };
function spend() {
  const today = new Date().toISOString().slice(0, 10);
  if (budget.day !== today) budget = { day: today, made: 0 };
  if (budget.made >= MAKES_PER_DAY) return false;
  budget.made += 1;
  return true;
}
// A picture that could not be made gives its place in the day back.
const refund = () => { budget.made = Math.max(0, budget.made - 1); };

let running = 0;
const waiting: (() => void)[] = [];
async function turn<T>(work: () => Promise<T>): Promise<T> {
  if (running >= AT_ONCE) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await work();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

// The metro a code belongs to, when the site knows where it is.
export function metroFor(code: string) {
  if (!/^[A-Z0-9]{3}$/.test(code)) return null;
  const metro = metroOf(code);
  const home = airport(airportOfMetro(metro));
  return home?.city ? metro : null;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
function kmBetween([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) {
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(a));
}

type Place = { latitude: number; longitude: number; country_code?: string; population?: number; feature_code?: string };

// The most populous place of the city's name in the airport's country within
// reach of it, tried under each name the site has for the city ("Guilin
// City" is "Guilin"; an island counts as a place). Where the gazetteer knows
// none of them, the airport itself, which for such a place (Santorini,
// Marrakech) lies by the town; null only when the search itself failed.
async function findCentre(metro: string): Promise<[number, number] | null> {
  const code = airportOfMetro(metro);
  const home = airport(code);
  if (!home) return null;
  const names = [...new Set([cityOf(code, "en"), home.city, home.city.replace(/\s+(City|Island|Islands|Town)$/i, "")].filter(Boolean))];
  for (const name of names) {
    const url = `${gazetteer()}?${new URLSearchParams({ name, count: "20", language: "en", format: "json" })}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`gazetteer ${response.status}`);
    const found = ((await response.json()) as { results?: Place[] }).results ?? [];
    const near = found
      .filter((place) => (place.feature_code?.startsWith("PPL") || place.feature_code === "ISL") && (!place.country_code || place.country_code === home.country))
      .map((place) => ({ place, km: kmBetween(home.coordinates, [place.longitude, place.latitude]) }))
      .filter(({ km }) => km <= REACH_KM)
      .sort((a, b) => (b.place.population ?? 0) - (a.place.population ?? 0) || a.km - b.km);
    if (near.length) return [near[0].place.longitude, near[0].place.latitude];
  }
  return home.coordinates;
}

async function centreOf(metro: string): Promise<[number, number] | null> {
  const row = cache().prepare("SELECT lon, lat, fetched FROM centres WHERE metro = ?").get(metro) as { lon: number | null; lat: number | null; fetched: number } | undefined;
  if (row && row.lon != null && row.lat != null) return [row.lon, row.lat];
  if (row && Date.now() - row.fetched < RETRY) return null;
  const centre = await findCentre(metro);
  cache().prepare("INSERT OR REPLACE INTO centres (metro, lon, lat, fetched) VALUES (?, ?, ?, ?)").run(metro, centre?.[0] ?? null, centre?.[1] ?? null, Date.now());
  return centre;
}

async function tile(z: number, x: number, y: number) {
  const response = await fetch(`${tiles()}/${z}/${y}/${x}.jpg`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`tile ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// vinext's type stubs declare sharp as unknown; this is the part used here.
type Pipeline = {
  composite(parts: { input: Buffer; left: number; top: number }[]): Pipeline;
  raw(): Pipeline;
  toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }>;
  extract(region: { left: number; top: number; width: number; height: number }): Pipeline;
  resize(width: number, height: number, options: { kernel: string }): Pipeline;
  jpeg(options: { quality: number; mozjpeg: boolean }): Pipeline;
  toBuffer(): Promise<Buffer>;
};
const image = sharp as unknown as (input: Buffer | { create: { width: number; height: number; channels: number; background: string } }, options?: { raw: { width: number; height: number; channels: number } }) => Pipeline;

// The picture centred on a point: tiles from the zoom just finer than the span
// needs, laid out and cut, then brought down to size.
async function compose([lon, lat]: [number, number], kind: ImageKind) {
  const { width, height, span } = SIZES[kind];
  const metresPerPixel = span / width;
  const exact = Math.log2((156_543.03 * Math.cos(toRad(lat))) / metresPerPixel);
  // Sentinel-2 sees 10 m; past zoom 13 the tiles are only enlarged.
  const z = Math.min(13, Math.max(1, Math.ceil(exact)));
  const scale = 2 ** (z - exact);
  const w = Math.round(width * scale), h = Math.round(height * scale);
  const world = 256 * 2 ** z;
  const cx = ((lon + 180) / 360) * world;
  const cy = ((1 - Math.log(Math.tan(toRad(lat)) + 1 / Math.cos(toRad(lat))) / Math.PI) / 2) * world;
  const left = Math.round(cx - w / 2), top = Math.round(cy - h / 2);
  const wanted: [number, number][] = [];
  for (let ty = Math.floor(top / 256); ty <= Math.floor((top + h - 1) / 256); ty++) {
    for (let tx = Math.floor(left / 256); tx <= Math.floor((left + w - 1) / 256); tx++) wanted.push([tx, ty]);
  }
  const n = 2 ** z;
  const parts = await Promise.all(wanted.map(async ([tx, ty]) => ({
    input: await tile(z, ((tx % n) + n) % n, Math.min(n - 1, Math.max(0, ty))),
    left: tx * 256 - left + 256,
    top: ty * 256 - top + 256,
  })));
  // Laid out as raw pixels, not an encoded image, so the canvas is not compressed only to be read again.
  const canvas = await image({ create: { width: w + 512, height: h + 512, channels: 3, background: "#0b0d12" } })
    .composite(parts).raw().toBuffer({ resolveWithObject: true });
  return image(canvas.data, { raw: canvas.info }).extract({ left: 256, top: 256, width: w, height: h })
    .resize(width, height, { kernel: "lanczos3" })
    .jpeg({ quality: kind === "wide" ? 80 : 82, mozjpeg: true })
    .toBuffer();
}

const making = new Map<string, Promise<Buffer | null>>();

// The picture of a metro, made once and kept; null when the city's centre
// is unknown or the day's budget is spent.
const fileOf = (metro: string, kind: ImageKind) => join(dataDir(), "imagery", `${metro}-${kind}-v${IMAGE_VERSION}.jpg`);
export const hasCityImage = (metro: string, kind: ImageKind) => existsSync(fileOf(metro, kind));

export async function cityImage(metro: string, kind: ImageKind): Promise<Buffer | null> {
  cache();
  const file = fileOf(metro, kind);
  if (existsSync(file)) return readFileSync(file);
  const key = `${metro}:${kind}`;
  const pending = making.get(key);
  if (pending) return pending;
  const job = turn(async () => {
    const centre = await centreOf(metro);
    if (!centre || !spend()) return null;
    try {
      const image = await compose(centre, kind);
      // Written whole or not at all: a release can stop the server mid-write.
      writeFileSync(`${file}.partial`, image);
      renameSync(`${file}.partial`, file);
      return image;
    } catch (error) {
      refund();
      throw error;
    }
  }).catch(() => null).finally(() => making.delete(key));
  making.set(key, job);
  return job;
}
