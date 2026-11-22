import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { validateArchive } from "./archive-validation.mjs";

const root = resolve(import.meta.dirname, "..");
const privateDefault = resolve(root, "data/private/flights.json");
const example = resolve(root, "app/data/flights.example.json");

async function exists(path) {
  try { await access(path, constants.R_OK); return true; } catch { return false; }
}

// npm lifecycle scripts run before Vite loads .env files. Explicit shell values
// win over .env.local, which wins over .env.
const localEnv = {};
for (const name of [".env", ".env.local"]) {
  const path = resolve(root, name);
  if (await exists(path)) Object.assign(localEnv, parseEnv(await readFile(path, "utf8")));
}
const configuredPath = process.env.FLIGHT_DATA_PATH ?? localEnv.FLIGHT_DATA_PATH;
const requested = configuredPath ? resolve(root, configuredPath) : privateDefault;
if (configuredPath && !(await exists(requested))) throw new Error("FLIGHT_DATA_PATH is set but the archive cannot be read. Check your local configuration.");
const source = await exists(requested) ? requested : example;
let archive;
try { archive = JSON.parse(await readFile(source, "utf8")); }
catch { throw new Error("Cannot parse flight archive JSON. Check your local archive."); }
const prepared = {
  ...archive,
  travellers: archive.travellers || [{ id: "B", label: "B", accent: "cyan" }],
  flights: Array.isArray(archive.flights) ? archive.flights.map((flight) => {
    const travellerId = flight.travellerId ?? "B";
    return { ...flight, travellerId, travellerIds: flight.travellerIds ?? [travellerId] };
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id))) : archive.flights,
};
validateArchive(prepared);

console.log(`Flight archive checked (${source === example ? "synthetic demo" : "private input"}, ${prepared.flights.length} flights).`);
