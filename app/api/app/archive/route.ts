import { userForToken } from "../../../lib/server/auth";
import { demoArchive, userArchive, viewerOf } from "../../../lib/server/archive";
import { database } from "../../../lib/server/db";
import { json, sessionToken } from "../../../lib/server/http";
import { residenceOf } from "../../../lib/residence";
import { buildTrips } from "../../../lib/trips";
import type { Archive } from "../../../lib/data";

// Everything the iOS app draws from, in one answer: the reader's archive (or
// the sample when nobody is signed in) with its trips and homes worked out by
// the same code the pages use, so both say the same thing about a person.
export function GET(request: Request) {
  database();
  const user = userForToken(sessionToken(request));
  const archive: Archive = user ? userArchive(user) : demoArchive();
  const trips = buildTrips(archive.flights).map(({ flights, ...trip }) => ({ ...trip, flightIds: flights.map((flight) => flight.id) }));
  const homes = residenceOf(archive.flights).homes;
  return json({ viewer: user ? viewerOf(user) : null, sample: !user, archive, trips, homes });
}
