import { clientAddress, fail, json } from "../../lib/server/http";
import { MAX_ASKED, MAX_RUNS, validDate, validPlace, weatherFor } from "../../lib/server/weather";

// The weather at airports on given days: ?at=MUC:2026-10-11,AMS:2026-10-11.
// Anyone may ask (the sample and shared pages show weather too); each address
// gets a modest number of asks a minute and of calls upstream an hour, and the
// server spends a daily budget of calls upstream whatever the asks.
const recent = new Map<string, number[]>();
const ASKS_PER_MINUTE = 30;
const CALLS_PER_HOUR = 60;
const spent = new Map<string, number[]>();

function callsLeft(address: string) {
  const now = Date.now();
  const times = (spent.get(address) ?? []).filter((t) => now - t < 3_600_000);
  spent.set(address, times);
  if (spent.size > 5000) spent.clear();
  return Math.min(MAX_RUNS, CALLS_PER_HOUR - times.length);
}

function charge(address: string, calls: number) {
  const times = spent.get(address) ?? [];
  for (let i = 0; i < calls; i++) times.push(Date.now());
  spent.set(address, times);
}

function allowed(address: string) {
  const now = Date.now();
  const times = (recent.get(address) ?? []).filter((t) => now - t < 60_000);
  if (times.length >= ASKS_PER_MINUTE) return false;
  times.push(now);
  recent.set(address, times);
  if (recent.size > 5000) recent.clear();
  return true;
}

export const GET = async (request: Request) => {
  const address = clientAddress(request);
  if (!allowed(address)) return fail("busy", 429);
  const asked = (new URL(request.url).searchParams.get("at") ?? "").split(",").filter(Boolean);
  if (asked.length === 0 || asked.length > MAX_ASKED) return fail("at");
  const wanted = [];
  for (const entry of asked) {
    const [place, day] = entry.split(":");
    if (!place || !day || !validPlace(place) || !validDate(day)) return fail("at");
    wanted.push({ place, day });
  }
  const { days, calls, complete } = await weatherFor(wanted, callsLeft(address));
  charge(address, calls);
  // Days long past never change; anything recent or ahead is asked again soon,
  // and an answer with gaps (upstream down, budget spent) is not kept at all.
  const settled = wanted.every(({ day }) => Date.parse(`${day}T00:00:00Z`) < Date.now() - 8 * 86_400_000);
  return json({ days }, 200, { "cache-control": !complete ? "no-store" : settled ? "public, max-age=604800" : "public, max-age=1800" });
};
