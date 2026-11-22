import { addFlight, type FlightInput } from "../../lib/server/edits";
import { body, json, signedIn } from "../../lib/server/http";

export const POST = signedIn(async (request, user) => {
  const result = addFlight(user.id, await body<FlightInput>(request));
  if ("error" in result) return json({ error: result.error, ...(result.id ? { id: result.id } : {}) }, result.error === "duplicate" ? 409 : 400);
  return json(result, 201);
}, { trial: true });
