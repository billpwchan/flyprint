import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const archivePath = resolve(process.argv[2] || "data/private/flights.json");
const archive = JSON.parse(await readFile(archivePath, "utf8"));
if (!Array.isArray(archive.flights)) throw new Error("Expected an archive with flights");

const rows = archive.flights
  .filter((flight) => !flight.aircraft)
  .sort((a, b) => b.date.localeCompare(a.date))
  .map((flight) => {
    const lookupFlight = flight.operation?.flight || flight.flight;
    return {
      id: flight.id,
      date: flight.date,
      marketingFlight: flight.flight,
      lookupFlight,
      route: `${flight.origin}-${flight.destination}`,
      state: flight.operation ? "operator-known-airframe-unresolved" : "operator-and-airframe-unresolved",
      query: `"${lookupFlight}" "${flight.date}" aircraft registration ${flight.origin} ${flight.destination}`,
    };
  });

console.log(["id", "date", "marketingFlight", "lookupFlight", "route", "state", "query"].join("\t"));
for (const row of rows) console.log([row.id, row.date, row.marketingFlight, row.lookupFlight, row.route, row.state, row.query].join("\t"));
