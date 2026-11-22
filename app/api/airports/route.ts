import { resolveAirport, searchAirports } from "../../lib/server/airportSearch";
import { json } from "../../lib/server/http";

// Suggestions while a flight is typed in by hand, the same for everyone. The
// airport a name clearly stands for leads the list and is named, so the form
// can show it in the field before the flight is saved.
export const GET = (request: Request) => {
  const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 60);
  const found = resolveAirport(query);
  const resolved = "code" in found ? found.code : null;
  const airports = searchAirports(query, 8);
  const lead = resolved ? airports.find((match) => match.code === resolved) ?? searchAirports(resolved, 1)[0] : undefined;
  const ordered = lead ? [lead, ...airports.filter((match) => match.code !== resolved)] : airports;
  return json({ airports: ordered.slice(0, 6), resolved }, 200, { "cache-control": "public, max-age=86400" });
};
