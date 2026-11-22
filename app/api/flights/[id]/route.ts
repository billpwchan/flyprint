import { updateFlight, type FlightInput } from "../../../lib/server/edits";
import { deleteFlight } from "../../../lib/server/flights";
import { body, fail, json, signedIn } from "../../../lib/server/http";

export const PATCH = signedIn(async (request, user, { params }) => {
  const result = updateFlight(user.id, (await params).id, await body<FlightInput>(request));
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "duplicate" ? 409 : 400;
    return json({ error: result.error, ...(result.id ? { id: result.id } : {}) }, status);
  }
  return json(result);
});

export const DELETE = signedIn(async (_request, user, { params }) => {
  return deleteFlight(user.id, (await params).id) ? json({ ok: true }) : fail("not_found", 404);
});
