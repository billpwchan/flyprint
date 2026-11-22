import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const archivePath = resolve(process.argv[2] || "data/private/flights.json");
const evidencePath = resolve(process.argv[3] || "data/private/aircraft-evidence.json");
const archive = JSON.parse(await readFile(archivePath, "utf8"));
const evidence = JSON.parse(await readFile(evidencePath, "utf8"));

if (!Array.isArray(archive.flights) || !Array.isArray(evidence.records)) {
  throw new Error("Expected an archive with flights and an evidence file with records");
}

const sourceOrder = ["operated", "scheduled", "typical"];
const errors = [];
const warnings = [];
const byId = new Map(archive.flights.map((flight) => [flight.id, flight]));
const evidenceById = new Map();

for (const record of evidence.records) {
  if (evidenceById.has(record.id)) {
    errors.push(`duplicate evidence id: ${record.id}`);
    continue;
  }
  evidenceById.set(record.id, record);
  const flight = byId.get(record.id);
  if (!flight) {
    errors.push(`unknown flight id: ${record.id}`);
    continue;
  }
  for (const field of ["date", "flight", "origin", "destination"]) {
    if (record[field] !== flight[field]) errors.push(`${record.id}: ${field} does not match archive`);
  }
  if (!record.aircraft && !record.operation) errors.push(`${record.id}: evidence has neither aircraft nor operation`);
  if (!record.evidenceUrl && !Array.isArray(record.evidenceUrls)) errors.push(`${record.id}: evidence URL is missing`);
  if (record.aircraft) {
    if (!record.aircraft.model || !record.aircraft.icao || !sourceOrder.includes(record.aircraft.source) || !["widebody", "narrowbody"].includes(record.aircraft.body)) {
      errors.push(`${record.id}: aircraft evidence is invalid`);
    }
    if (record.aircraft.source === "operated" && !record.aircraft.registration) warnings.push(`${record.id}: operated type has no registration`);
    if (flight.aircraft && JSON.stringify(flight.aircraft) !== JSON.stringify(record.aircraft)) errors.push(`${record.id}: archive aircraft differs from evidence`);
  }
  if (record.operation && (!record.operation.airline || !record.operation.flight || !["operated", "scheduled"].includes(record.operation.source))) {
    errors.push(`${record.id}: operation evidence is invalid`);
  }
  if (record.operation && flight.operation && JSON.stringify(flight.operation) !== JSON.stringify(record.operation)) errors.push(`${record.id}: archive operation differs from evidence`);
}

for (const flight of archive.flights) {
  if (flight.aircraft && !evidenceById.get(flight.id)?.aircraft) warnings.push(`${flight.id}: archive aircraft has no private evidence row`);
  if (flight.operation && !evidenceById.get(flight.id)?.operation) warnings.push(`${flight.id}: archive operation has no private evidence row`);
}

const counts = Object.fromEntries(sourceOrder.map((source) => [source, archive.flights.filter((flight) => flight.aircraft?.source === source).length]));
const missing = archive.flights.filter((flight) => !flight.aircraft);
const operatorKnownOnly = missing.filter((flight) => flight.operation);
const fullyUnresolved = missing.filter((flight) => !flight.operation);
const actualWithRegistration = archive.flights.filter((flight) => flight.aircraft?.source === "operated" && flight.aircraft.registration).length;
const operations = archive.flights.filter((flight) => flight.operation).length;
const recentYears = [...new Set(archive.flights.map((flight) => flight.year))].sort((a, b) => b - a).slice(0, 6);

console.log("Aircraft evidence audit");
console.log(`Archive: ${archive.flights.length} flights`);
console.log(`Aircraft: ${counts.operated} operated · ${counts.scheduled} scheduled · ${counts.typical} typical · ${missing.length} unresolved`);
console.log(`Actual registrations: ${actualWithRegistration} · operating-flight mappings: ${operations} · operator known/airframe unresolved: ${operatorKnownOnly.length}`);
console.log(`Private evidence coverage: ${evidence.records.filter((record) => record.aircraft).length}/${archive.flights.filter((flight) => flight.aircraft).length} aircraft records`);
console.log("");
console.log("Recent-year coverage");
for (const year of recentYears) {
  const flights = archive.flights.filter((flight) => flight.year === year);
  const actual = flights.filter((flight) => flight.aircraft?.source === "operated").length;
  const planned = flights.filter((flight) => flight.aircraft && flight.aircraft.source !== "operated").length;
  const operatorKnown = flights.filter((flight) => !flight.aircraft && flight.operation).length;
  const unresolved = flights.filter((flight) => !flight.aircraft && !flight.operation).length;
  console.log(`${year}: ${flights.length} total · ${actual} operated · ${planned} non-operated · ${operatorKnown} operator-known · ${unresolved} unresolved`);
}

const unresolvedByCarrier = new Map();
for (const flight of fullyUnresolved) unresolvedByCarrier.set(flight.airline, (unresolvedByCarrier.get(flight.airline) || 0) + 1);
console.log("");
console.log("Largest unresolved carrier groups");
for (const [airline, count] of [...unresolvedByCarrier].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`${airline}: ${count}`);

if (warnings.length) {
  console.log("");
  console.log(`Warnings (${warnings.length})`);
  for (const warning of warnings.slice(0, 20)) console.log(`- ${warning}`);
  if (warnings.length > 20) console.log(`- … ${warnings.length - 20} more`);
}
if (errors.length) {
  console.error("");
  console.error(`Errors (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}
