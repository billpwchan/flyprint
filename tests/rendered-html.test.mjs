import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before } from "node:test";
import test from "node:test";
import { startProdServer } from "vinext/server/prod-server";

// The same Node server the container runs, on a free local port, with an
// empty account database of its own. A visitor who is not signed in sees the
// synthetic sample archive.
let origin = "";
let server;
before(async () => {
  process.env.FLYPRINT_DATA_DIR = await mkdtemp(join(tmpdir(), "flyprint-test-"));
  const started = await startProdServer({ port: 0, host: "127.0.0.1", outDir: fileURLToPath(new URL("../dist", import.meta.url)), silent: true });
  server = started.server;
  origin = `http://127.0.0.1:${started.port}`;
});
after(() => server?.close());

const render = (path = "/", headers = {}) => fetch(`${origin}${path}`, { headers: { accept: "text/html", ...headers }, redirect: "manual" });

const sample = JSON.parse(await readFile(new URL("../app/data/flights.example.json", import.meta.url), "utf8"));
const archive = {
  ...sample,
  flights: sample.flights
    .map((flight) => ({ ...flight, travellerIds: flight.travellerIds ?? [flight.travellerId ?? "B"] }))
    .sort((a, b) => b.date.localeCompare(a.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
};
const zh = { "accept-language": "zh-CN,zh;q=0.9" };
const en = { cookie: "flight-atlas-locale=en" };
const html = async (path, headers = zh) => {
  const response = await render(path, headers);
  assert.equal(response.status, 200, path);
  return response.text();
};
const title = (source) => source.match(/<title>([^<]*)<\/title>/)?.[1];

test("every section renders on the server with a title naming what is on screen", async () => {
  const latest = archive.flights.map((flight) => flight.year).sort().at(-1);
  const flight = archive.flights[0];
  const expected = [
    ["/", "航迹"],
    [`/?year=${latest}`, `${latest} 年 — 航迹`],
    ["/places", "足迹 — 航迹"],
    ["/log", "航班 — 航迹"],
    [`/flights/${encodeURIComponent(flight.id)}`, `${flight.flight} `],
  ];
  for (const [path, name] of expected) {
    const source = await html(path);
    assert.ok(title(source)?.startsWith(name), `${path}: ${title(source)}`);
    assert.match(source, /<html lang="zh-Hans"/, path);
    assert.doesNotMatch(source, /codex-preview|Your site is taking shape/i, path);
  }
});

test("a year chosen in the address is the first render of every section", async () => {
  const years = [...new Set(archive.flights.map((flight) => flight.year))].sort();
  const year = years.at(-2) ?? years[0];
  for (const path of ["/", "/places", "/log"]) {
    const source = await html(`${path}?year=${year}`);
    assert.match(source, new RegExp(`<h1[^>]*>(?:<[^>]+>)*[^<]*${year}`), path);
    assert.match(source, new RegExp(`aria-pressed="true" aria-label="${year}:`), `${path} marks the year on the time bar`);
  }
  const all = await html("/?year=nineteen");
  assert.doesNotMatch(all, /aria-pressed="true" aria-label="\d{4}:/, "a malformed year shows the whole archive");
});

test("the archive links its trips, and a trip and a city open from those links", async () => {
  const list = await html("/");
  const trip = list.match(/href="(\/trips\/[^"]+)"/)?.[1];
  assert.ok(trip, "the trips section lists trips");
  const tripPage = await html(trip);
  assert.notEqual(title(tripPage), "旅程 — 航迹", "trip resolves to a named destination");
  assert.match(tripPage, /href="\/flights\//, "legs link to their flights");
  const place = tripPage.match(/href="(\/places\/[^"]+)"/)?.[1] ?? "/places/HKG";
  const placePage = await html(place);
  assert.doesNotMatch(placePage, /档案里没有这座城市/);
});

test("an airport code opens its city, and unknown records say so plainly", async () => {
  const code = archive.flights[0].destination;
  assert.equal((await render(`/places/${code}`, zh)).status, 200);
  assert.match(await html("/flights/not-a-flight"), /档案里没有这次航班/);
  assert.match(await html("/trips/not-a-trip"), /没有找到这段旅程/);
  assert.equal((await render("/years/nineteen", zh)).status, 404);
});

test("addresses from the previous layout redirect permanently", async () => {
  const moved = { "/journeys": "/", "/global": "/", "/experience": "/", "/together": "/", "/atlas": "/places", "/insights": "/", "/flights": "/log", "/years": "/", "/years/2019": "/?year=2019", "/trips": "/", "/trips?year=2024": "/?year=2024", "/fleet": "/places", "/fleet?year=2024": "/places?year=2024" };
  for (const [from, to] of Object.entries(moved)) {
    const response = await render(from, zh);
    assert.equal(response.status, 308, from);
    const location = new URL(response.headers.get("location"), origin);
    assert.equal(`${location.pathname}${location.search}`, to, from);
  }
});

test("visitors can open the sample's page for two, and only that one", async () => {
  const source = await html("/with/sample");
  assert.equal(title(source), "我和 Theo — 航迹");
  assert.match(source, /和 Theo 一起飞了 \d+ 次/);
  assert.doesNotMatch(source, /解除和/, "the sample has no sharing controls");
  const other = await render("/with/u_someone", zh);
  assert.equal(other.status, 307);
  assert.match(other.headers.get("location"), /\/login\?next=%2Fwith%2Fu_someone/);
});

test("the first render follows the reader's language and keeps it across sections", async () => {
  const traditional = await html("/places", { cookie: "flight-atlas-locale=zh-Hant" });
  assert.match(traditional, /<html lang="zh-Hant"/);
  assert.match(traditional, /足跡 — 航跡/);
  assert.match(traditional, /國家和地區/);
  const english = await html("/log", en);
  assert.match(english, /<html lang="en"/);
  assert.match(english, /Flights — Flyprint/);
  assert.match(english, /flights</);
  const browser = await html("/", { "accept-language": "en-GB,en;q=0.9" });
  assert.match(browser, /<html lang="en"/);
  // Names come from the app, not the runtime's ICU, so the browser hydrates the same text.
  for (const [path, headers] of [["/places", zh], ["/places", { cookie: "flight-atlas-locale=zh-Hant" }], ["/places", en]]) {
    assert.doesNotMatch(await html(path, headers), /特别行政区|特別行政區|SAR China/, path);
  }
  const provider = await readFile(new URL("../app/components/LocaleProvider.tsx", import.meta.url), "utf8");
  assert.match(provider, /document\.cookie/);
});

test("pages never show where the archive was collected from", async () => {
  for (const flight of archive.flights.slice(0, 6)) {
    const source = await html(`/flights/${encodeURIComponent(flight.id)}`);
    assert.doesNotMatch(source, /航旅纵横|航旅縱橫|umetrip|出入境|immigration/i, flight.id);
  }
});

test("scripts carry the request's CSP nonce", async () => {
  const nonce = "flightlog-test-nonce";
  const secured = await render("/places", { ...zh, "x-nonce": nonce, "content-security-policy": `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'` });
  assert.match(await secured.text(), new RegExp(`<script[^>]+nonce="${nonce}"`));
});

test("client chunks avoid vinext's dynamically destructured navigation export", async () => {
  const chunkDirectory = new URL("../dist/client/_next/static/chunks/", import.meta.url);
  const chunks = await readdir(chunkDirectory, { recursive: true });
  for (const name of chunks.filter((entry) => entry.endsWith(".js"))) {
    const source = await readFile(new URL(name, chunkDirectory), "utf8");
    assert.doesNotMatch(source, /\{\s*navigateClientSide(?:\s*:\s*\w+)?\s*\}\s*=\s*await[\s\S]{0,300}?import\(/, name);
  }
});

test("the sample shown to visitors is valid and carries no ticket metadata", async () => {
  assert.ok(archive.flights.length > 0);
  assert.ok(Object.keys(archive.airports).length > 1);
  assert.equal(archive.flights.every((flight) => archive.airports[flight.origin] && archive.airports[flight.destination]), true);
  assert.deepEqual(archive.travellers.map((traveller) => traveller.id), ["B", "Z"]);
  assert.equal(archive.flights.every((flight) => Array.isArray(flight.travellerIds) && flight.travellerIds.length > 0), true);
  assert.ok(archive.flights.some((flight) => flight.travellerIds.length === 2));
  assert.equal(new Set(archive.flights.map((flight) => `${flight.date}|${flight.flight}|${flight.origin}|${flight.destination}`)).size, archive.flights.length);
  assert.equal(archive.flights.some((flight) => "ticket" in flight), false);
  const page = await html("/log");
  assert.doesNotMatch(page, /"(status|source|confidence|reconciliation)":/, "only shown fields reach the page");
  assert.equal(archive.flights.every((flight) => ["recorded", "historical_schedule"].includes(flight.timeSource)), true);
  assert.equal(archive.flights.every((flight) => Number.isInteger(flight.arrivalDayOffset)), true);
  assert.equal(archive.flights.every((flight) => Number.isInteger(flight.durationMinutes) && flight.durationMinutes > 0), true);
});

test("ships a transparent mark for every airline it lists", async () => {
  const logoDirectory = new URL("../public/airlines/", import.meta.url);
  const listed = JSON.parse(await readFile(new URL("../app/lib/carrier-marks.json", import.meta.url), "utf8"));
  const logos = (await readdir(logoDirectory)).filter((name) => name.endsWith(".webp"));
  assert.ok(listed.length >= 900, `${listed.length} marks`);
  assert.deepEqual(logos.map((name) => name.slice(0, -5)).sort(), [...listed].sort());
  for (const logo of logos) {
    const image = await readFile(new URL(logo, logoDirectory));
    // RIFF....WEBPVP8X with the alpha flag set.
    assert.equal(image.toString("ascii", 0, 4) + image.toString("ascii", 8, 16), "RIFFWEBPVP8X", `${logo} is an extended WebP`);
    assert.ok(image[20] & 0x10, `${logo} must have an alpha channel`);
  }
  const page = await html("/places");
  assert.match(page, /\/airlines\/[A-Z0-9]{2}\.webp/, "pages draw the marks");
});
