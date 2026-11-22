import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const archivePath = resolve(process.argv[2] || "data/private/flights.json");
const evidencePath = resolve(process.argv[3] || "data/private/aircraft-evidence.json");
const archive = JSON.parse(await readFile(archivePath, "utf8"));
const evidence = JSON.parse(await readFile(evidencePath, "utf8"));

if (!Array.isArray(archive.flights) || !Array.isArray(evidence.records)) {
  throw new Error("Expected an archive with flights and an evidence file with records");
}

const byId = new Map(archive.flights.map((flight) => [flight.id, flight]));
const seen = new Set();
for (const record of evidence.records) {
  if (seen.has(record.id)) throw new Error(`Duplicate evidence id: ${record.id}`);
  seen.add(record.id);
  const flight = byId.get(record.id);
  if (!flight) throw new Error(`Unknown flight id: ${record.id}`);
  for (const field of ["date", "flight", "origin", "destination"]) {
    if (flight[field] !== record[field]) throw new Error(`Evidence mismatch for ${record.id}: ${field}`);
  }
  if (!record.aircraft && !record.operation) throw new Error(`Evidence contains no aircraft or operation for ${record.id}`);
  if (record.aircraft && (!record.aircraft.model || !record.aircraft.icao || !["operated", "scheduled", "typical"].includes(record.aircraft.source) || !["widebody", "narrowbody"].includes(record.aircraft.body))) {
    throw new Error(`Invalid aircraft evidence for ${record.id}`);
  }
  if (record.operation && (!record.operation.airline || !record.operation.flight || !["operated", "scheduled"].includes(record.operation.source))) {
    throw new Error(`Invalid operation evidence for ${record.id}`);
  }
  if (record.aircraft) flight.aircraft = record.aircraft;
  if (record.operation) flight.operation = record.operation;
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${archivePath}.before-aircraft-${stamp}`;
const temporaryPath = `${archivePath}.aircraft-update`;
await copyFile(archivePath, backupPath);
await writeFile(temporaryPath, `${JSON.stringify(archive, null, 2)}\n`);
await rename(temporaryPath, archivePath);
console.log(`Applied ${evidence.records.length} evidence records; backup: ${backupPath}`);
