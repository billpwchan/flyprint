const travellerIds = new Set(["B", "Z"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$|^--:--$/;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;

// Errors identify fields and row numbers, never private record contents.
export function validateArchive(archive) {
  const fail = (field) => { throw new Error(`Invalid flight archive: ${field}`); };
  if (!object(archive) || !object(archive.airports) || !Array.isArray(archive.flights)) fail("expected airports and flights");
  if (Object.keys(archive.airports).length < 2) fail("at least two airports are required");
  for (const [index, [code, airport]] of Object.entries(archive.airports).entries()) {
    const field = `airports row ${index + 1}`;
    if (!/^[A-Z0-9]{3}$/.test(code) || !object(airport) || airport.code !== code) fail(`${field}.code`);
    for (const name of ["name", "city", "country"]) if (!nonempty(airport[name])) fail(`${field}.${name}`);
    const coordinates = airport.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite)
      || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) fail(`${field}.coordinates`);
  }
  if (!Array.isArray(archive.travellers) || !archive.travellers.length || archive.travellers.length > 2) fail("travellers");
  const declared = new Set();
  for (const traveller of archive.travellers) {
    if (!object(traveller) || !travellerIds.has(traveller.id) || declared.has(traveller.id)
      || !nonempty(traveller.label) || !["cyan", "violet"].includes(traveller.accent)) fail("travellers entry");
    declared.add(traveller.id);
  }
  const ids = new Set();
  const journeys = new Set();
  for (const [index, flight] of archive.flights.entries()) {
    const field = `flights row ${index + 1}`;
    if (!object(flight)) fail(field);
    for (const name of ["id", "airline", "flight", "status", "source", "confidence"]) if (!nonempty(flight[name])) fail(`${field}.${name}`);
    if (ids.has(flight.id)) fail(`${field}.id (duplicate)`);
    ids.add(flight.id);
    if (!datePattern.test(flight.date) || Number.isNaN(Date.parse(`${flight.date}T00:00:00Z`))
      || new Date(`${flight.date}T00:00:00Z`).toISOString().slice(0, 10) !== flight.date
      || flight.year !== Number(flight.date.slice(0, 4))) fail(`${field}.date/year`);
    if (!Object.hasOwn(archive.airports, flight.origin) || !Object.hasOwn(archive.airports, flight.destination)
      || flight.origin === flight.destination) fail(`${field}.origin/destination`);
    for (const name of ["depart", "arrive"]) if (!timePattern.test(flight[name])) fail(`${field}.${name}`);
    for (const name of ["durationMinutes", "km"]) if (!Number.isInteger(flight[name]) || flight[name] <= 0) fail(`${field}.${name}`);
    if (!Number.isInteger(flight.arrivalDayOffset)) fail(`${field}.arrivalDayOffset`);
    if (!["recorded", "historical_schedule"].includes(flight.timeSource)) fail(`${field}.timeSource`);
    if (!declared.has(flight.travellerId) || !Array.isArray(flight.travellerIds) || !flight.travellerIds.length
      || flight.travellerIds.length > 2 || new Set(flight.travellerIds).size !== flight.travellerIds.length
      || !flight.travellerIds.every((id) => declared.has(id)) || !flight.travellerIds.includes(flight.travellerId)) fail(`${field}.travellerIds`);
    const journey = [flight.date, flight.flight, flight.origin, flight.destination].join("|");
    if (journeys.has(journey)) fail(`${field} (duplicate journey; merge travellerIds)`);
    journeys.add(journey);
    if (flight.aircraft !== undefined) {
      const aircraft = flight.aircraft;
      if (!object(aircraft) || !nonempty(aircraft.model) || !nonempty(aircraft.icao)
        || !["operated", "scheduled", "typical"].includes(aircraft.source)
        || !["widebody", "narrowbody"].includes(aircraft.body)) fail(`${field}.aircraft`);
      if (aircraft.registration !== undefined && (!nonempty(aircraft.registration) || aircraft.source !== "operated")) fail(`${field}.aircraft.registration (requires operated evidence)`);
    }
    if (flight.operation !== undefined && (!object(flight.operation) || !nonempty(flight.operation.airline)
      || !nonempty(flight.operation.flight) || !["operated", "scheduled"].includes(flight.operation.source))) fail(`${field}.operation`);
  }
  return archive;
}
