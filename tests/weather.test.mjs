import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after, before } from "node:test";
import { build } from "rolldown";
import { startProdServer } from "vinext/server/prod-server";

// How a day's weather is read and drawn, and the server's /api/weather
// against a stand-in for Open-Meteo, so nothing here goes to the network.
const root = resolve(import.meta.dirname, "..");
const scratch = await mkdtemp(join(tmpdir(), "flyprint-weather-"));
await writeFile(join(scratch, "entry.ts"), `export * from ${JSON.stringify(join(root, "app/lib/weather.ts"))};`);
await build({ input: join(scratch, "entry.ts"), platform: "node", output: { file: join(scratch, "weather.mjs"), format: "esm" }, logLevel: "silent" });
const { daytime, hourOf, kindOf, weatherWord, windowLook } = await import(pathToFileURL(join(scratch, "weather.mjs")).href);

// Hours as [°C, code, cloud %, mm, day].
const day = (hours, code = 3) => ({ hi: 20, lo: 10, code, rain: 0, hours });
const hours = (fill) => Array.from({ length: 24 }, (_, h) => fill(h));

test("a sunny day with one evening shower reads as fair, not rain", () => {
  const shower = day(hours((h) => [15, h === 20 ? 80 : 1, 15, h === 20 ? 2 : 0, h > 6 && h < 19 ? 1 : 0]), 80);
  assert.equal(kindOf(shower.code).kind, "rain");
  assert.deepEqual(daytime(shower), { code: 0, cloud: 15 });
});

test("rain through the afternoon is the day's weather, at the strength it mostly fell", () => {
  const wet = day(hours((h) => [12, h >= 12 && h <= 16 ? (h === 14 ? 65 : 61) : 3, 95, 1, 1]), 65);
  assert.equal(daytime(wet).code, 61);
  assert.equal(weatherWord(daytime(wet).code, "zh-Hans"), "小雨");
  assert.equal(weatherWord(65, "en"), "Heavy rain");
});

test("windows: a clear night has stars and the moon, an overcast noon a grey deck, snow falls as snow", () => {
  const night = windowLook(-30, 0, 0);
  assert.ok(night.stars > 0.9 && night.moon > 0.8 && night.sun === 0);
  const grey = windowLook(40, 100, 3);
  assert.ok(grey.deck > 0.8 && grey.sun === 0 && grey.fall === null);
  assert.ok(grey.top[2] - grey.top[0] < 40, "an overcast sky is grey, not blue");
  const snow = windowLook(20, 90, 75);
  assert.equal(snow.fall, "snow");
  assert.equal(snow.amount, 3);
  assert.equal(hourOf("07:20"), 7);
  assert.equal(hourOf("07:40"), 8);
  assert.equal(hourOf("23:50"), 23);
  assert.equal(hourOf(""), null);
});

// A stand-in for Open-Meteo, answering in UTC as the server asks: each hour's
// temperature is its UTC hour, so where it lands shows the local clock. It
// counts the calls, and can be made to fail.
let calls = [];
let down = false;
const upstream = createServer((request, response) => {
  const url = new URL(request.url, "http://upstream");
  calls.push(`${url.pathname} ${url.searchParams.get("start_date")} ${url.searchParams.get("end_date")} ${url.searchParams.get("timezone")}`);
  if (down) { response.statusCode = 503; response.end(); return; }
  const days = [];
  for (let d = new Date(`${url.searchParams.get("start_date")}T00:00:00Z`); d <= new Date(`${url.searchParams.get("end_date")}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  const time = days.flatMap((date) => Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, "0")}:00`));
  const hour = (t) => Number(t.slice(11, 13));
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({
    hourly: { time, temperature_2m: time.map(hour), weather_code: time.map((t) => (hour(t) === 18 ? 61 : 3)), cloud_cover: time.map(() => 100), precipitation: time.map((t) => (hour(t) === 18 ? 1.5 : 0)), is_day: time.map((t) => (hour(t) > 7 && hour(t) < 18 ? 1 : 0)) },
  }));
});

let origin = "";
let server;
before(async () => {
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  process.env.FLYPRINT_WEATHER_UPSTREAM = `http://127.0.0.1:${upstream.address().port}`;
  process.env.FLYPRINT_DATA_DIR = await mkdtemp(join(tmpdir(), "flyprint-weather-data-"));
  const started = await startProdServer({ port: 0, host: "127.0.0.1", outDir: fileURLToPath(new URL("../dist", import.meta.url)), silent: true });
  server = started.server;
  origin = `http://127.0.0.1:${started.port}`;
});
after(async () => {
  server?.close();
  upstream.close();
  await rm(scratch, { recursive: true, force: true });
  await rm(process.env.FLYPRINT_DATA_DIR, { recursive: true, force: true });
});

const ask = (at) => fetch(`${origin}/api/weather?at=${at}`);
const daysAhead = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test("days long past come from the reanalysis, on the airport's own clock, and are kept", async () => {
  calls = [];
  const response = await ask("MUC:2024-10-11,MUC:2024-10-13,AMS:2024-10-11");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /max-age=604800/);
  const { days } = await response.json();
  // Summer time in Amsterdam: 09:00 there is 07:00 UTC.
  assert.deepEqual(days["AMS 2024-10-11"].hours[9], [7, 3, 100, 0, 0]);
  // The day's figures are its own local hours: 22:00 UTC the evening before to 21:00 UTC.
  assert.equal(days["MUC 2024-10-11"].hi, 23);
  assert.equal(days["MUC 2024-10-11"].lo, 0);
  assert.equal(days["MUC 2024-10-11"].rain, 1.5);
  assert.equal(days["MUC 2024-10-11"].code, 61);
  assert.equal(days["MUC 2024-10-13"].hours.length, 24);
  // Munich's two days close together go in one call, in UTC with a day either side.
  assert.deepEqual(calls.sort(), ["/archive 2024-10-10 2024-10-12 GMT", "/archive 2024-10-10 2024-10-14 GMT"]);
  calls = [];
  await (await ask("MUC:2024-10-12")).json();
  assert.deepEqual(calls, [], "a day already fetched is not asked for again");
});

test("a summer day asked in winter, a winter day, and the days the clocks change keep the local clock", async () => {
  const { days } = await (await ask("MUC:2024-07-01,MUC:2024-01-15,MUC:2024-03-31,MUC:2024-10-27")).json();
  assert.equal(days["MUC 2024-07-01"].hours[14][0], 12, "14:00 in a Munich summer is 12:00 UTC");
  assert.equal(days["MUC 2024-01-15"].hours[14][0], 13, "14:00 in a Munich winter is 13:00 UTC");
  // Clocks go forward at 02:00: there is no 02:00, it takes 01:00's hour; 03:00 is 01:00 UTC.
  assert.deepEqual(days["MUC 2024-03-31"].hours.slice(0, 4).map((hour) => hour[0]), [23, 0, 0, 1]);
  // Clocks go back at 03:00: 02:00 happens twice, the first is 00:00 UTC; 03:00 is 02:00 UTC.
  assert.deepEqual(days["MUC 2024-10-27"].hours.slice(1, 4).map((hour) => hour[0]), [23, 0, 2]);
});

test("when Open-Meteo fails nothing is kept, and the answer is not cached", async () => {
  down = true;
  calls = [];
  const response = await ask("LIS:2023-05-02");
  down = false;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).days["LIS 2023-05-02"], null);
  assert.equal(calls.length, 1);
  const again = await (await ask("LIS:2023-05-02")).json();
  assert.equal(again.days["LIS 2023-05-02"].hours.length, 24, "a failed day is asked for again");
});

test("one ask makes at most eight calls upstream; the rest wait for the next", async () => {
  calls = [];
  const spread = Array.from({ length: 12 }, (_, i) => `NRT:20${10 + i}-06-01`).join(",");
  const response = await ask(spread);
  const { days } = await response.json();
  assert.equal(calls.length, 8);
  assert.equal(Object.values(days).filter(Boolean).length, 8);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("days ahead come from the forecast; past its reach there is nothing, and nothing is asked", async () => {
  calls = [];
  const soon = daysAhead(3), far = daysAhead(40);
  const { days } = await (await ask(`PVG:${soon},PVG:${far}`)).json();
  assert.equal(days[`PVG ${soon}`].hours[8][0], 0, "08:00 in Shanghai is midnight UTC");
  assert.equal(days[`PVG ${far}`], null);
  assert.deepEqual(calls, [`/forecast ${daysAhead(2)} ${daysAhead(4)} GMT`]);
});

test("only real airports and dates, and a bounded number at once", async () => {
  assert.equal((await ask("XXX:2024-10-11")).status, 400);
  assert.equal((await ask("MUC:2024-13-45")).status, 400);
  assert.equal((await ask("MUC:2026-02-30")).status, 400);
  assert.equal((await ask("MUC:2025-02-29")).status, 400);
  assert.equal((await ask("MUC")).status, 400);
  assert.equal((await ask(Array.from({ length: 65 }, () => "MUC:2024-10-11").join(","))).status, 400);
});
