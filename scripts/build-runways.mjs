// Builds the server's runway table from OurAirports (public domain): for each
// airport in the gazetteer, every open runway with both ends surveyed, as
// [lon, lat, lon, lat] of its thresholds, its width in metres, end names and
// declared length in metres. An open runway without both ends (or with both
// at one point) is listed under `unsurveyed` by its declared length, so the
// page can count it without drawing a guess; an airport with none surveyed is
// left out.
// Usage: node scripts/build-runways.mjs [path/to/runways.csv]
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SOURCE = "https://davidmegginson.github.io/ourairports-data/runways.csv";
const airportsPath = resolve(import.meta.dirname, "../app/lib/server/airports.json");
const output = resolve(import.meta.dirname, "../app/lib/server/runways.json");
const input = process.argv[2];
const raw = input ? await readFile(input, "utf8") : await (await fetch(SOURCE)).text();

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const [header, ...rows] = parseCsv(raw);
const col = Object.fromEntries(header.map((name, index) => [name, index]));
const airports = JSON.parse(await readFile(airportsPath, "utf8"));
const iataByIcao = new Map(Object.entries(airports).filter(([, row]) => row[6]).map(([iata, row]) => [row[6], iata]));

const round = (value) => Math.round(value * 1e5) / 1e5;
const byAirport = new Map();
const unsurveyed = new Map();
for (const row of rows) {
  const iata = iataByIcao.get(row[col.airport_ident]);
  if (!iata || row[col.closed] === "1") continue;
  const fields = [col.le_longitude_deg, col.le_latitude_deg, col.he_longitude_deg, col.he_latitude_deg].map((index) => row[index]);
  const ends = fields.map(Number);
  const length = Math.round(Number(row[col.length_ft]) * 0.3048) || 0;
  const missing = fields.some((value) => !value) || ends.some((value) => !Number.isFinite(value));
  if (missing || (ends[0] === ends[2] && ends[1] === ends[3])) {
    unsurveyed.set(iata, [...(unsurveyed.get(iata) ?? []), length]);
    continue;
  }
  const width = Math.round(Number(row[col.width_ft]) * 0.3048) || 45;
  const list = byAirport.get(iata) ?? [];
  list.push([...ends.map(round), width, row[col.le_ident], row[col.he_ident], length]);
  byAirport.set(iata, list);
}
const table = { runways: {}, unsurveyed: {} };
for (const [iata, list] of [...byAirport.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  table.runways[iata] = list;
  if (unsurveyed.has(iata)) table.unsurveyed[iata] = unsurveyed.get(iata);
}
await writeFile(output, `${JSON.stringify(table)}\n`);
const partial = Object.keys(table.unsurveyed).length;
const none = [...unsurveyed.keys()].filter((iata) => !byAirport.has(iata)).length;
console.log(`${Object.keys(table.runways).length} airports with runways → ${output} (${partial} with some runways unsurveyed; ${none} with none surveyed, left out)`);
