// Builds the server's airport gazetteer from mwgg/Airports (MIT): every
// airport with an IATA code, its position, country and IANA time zone.
// Usage: node scripts/build-airports.mjs [path/to/airports.json]
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SOURCE = "https://raw.githubusercontent.com/mwgg/Airports/master/airports.json";
const output = resolve(import.meta.dirname, "../app/lib/server/airports.json");
const input = process.argv[2];
const raw = input ? await readFile(input, "utf8") : await (await fetch(SOURCE)).text();
const records = Object.values(JSON.parse(raw)).filter((airport) => /^[A-Z]{3}$/.test(airport.iata ?? ""));
const round = (value) => Math.round(value * 1e5) / 1e5;
const table = {};
for (const airport of records.sort((a, b) => (a.iata < b.iata ? -1 : 1))) {
  table[airport.iata] = [round(airport.lon), round(airport.lat), airport.country, airport.tz, airport.city || "", airport.name.replace(/\s+(International\s+)?Airport$/i, "").trim(), airport.icao || ""];
}
await writeFile(output, `${JSON.stringify(table)}\n`);
console.log(`${Object.keys(table).length} airports → ${output}`);
