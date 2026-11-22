import { recordsOf } from "../../lib/server/archive";
import { signedIn } from "../../lib/server/http";

// Everything the reader has logged, in the form the importer reads back.
export const GET = signedIn((_request, user) => {
  const flights = recordsOf(user.id);
  const body = JSON.stringify({ format: "flyprint", version: 1, exportedAt: new Date().toISOString(), flights }, null, 2);
  return new Response(body, { headers: {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": `attachment; filename="flyprint-flights-${new Date().toISOString().slice(0, 10)}.json"`,
    "cache-control": "no-store",
  } });
}, { write: false });
