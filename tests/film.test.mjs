import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "rolldown";

const root = resolve(import.meta.dirname, "..");
const scratch = await mkdtemp(join(tmpdir(), "flyprint-film-"));
const entry = join(scratch, "entry.ts");
await writeFile(entry, `export * from ${JSON.stringify(join(root, "app/components/cards/timeline.ts"))};`);
await build({ input: entry, platform: "node", output: { file: join(scratch, "film.mjs"), format: "esm" }, logLevel: "silent" });
const { FPS, planFilm, flown, travelOrder } = await import(pathToFileURL(join(scratch, "film.mjs")).href);
test.after(() => rm(scratch, { recursive: true, force: true }));

const year = (count, minutes = (index) => 60 + (index * 97) % 600) => Array.from({ length: count }, (_, index) => minutes(index));

test("a film runs long enough to watch and never longer than a feed allows, however many flights", () => {
  for (const count of [1, 2, 3, 4, 8, 12, 32, 80, 197, 1000]) {
    const plan = planFilm(year(count));
    assert.ok(plan.total <= 16, `${count} flights run ${plan.total} s`);
    assert.ok(plan.total >= (count >= 4 ? 9.5 : 6), `${count} flights run only ${plan.total} s`);
    assert.equal(plan.frames, Math.round(plan.total * FPS));
  }
});

test("it opens and ends on the finished card, with the flights between", () => {
  const plan = planFilm(year(32));
  assert.ok(plan.cover > 0 && plan.cover < plan.unwound);
  assert.ok(plan.unwound < plan.legs[0].start, "the globe is bare a moment before the first take-off");
  assert.ok(plan.legs.every((leg) => leg.land <= plan.landed));
  assert.ok(plan.landed < plan.finished && plan.finished < plan.total);
  assert.ok(plan.total - plan.finished >= 2, "the finished card holds long enough to read");
});

test("flights take off in travel order, evenly, and more of them come faster", () => {
  let before = Infinity;
  for (const count of [1, 2, 5, 9, 20, 32, 64, 197]) {
    const plan = planFilm(year(count));
    const gaps = plan.legs.slice(1).map((leg, index) => leg.start - plan.legs[index].start);
    for (const gap of gaps) assert.ok(Math.abs(gap - plan.every) < 1e-9);
    assert.ok(plan.every <= before, `${count} flights come slower than fewer did`);
    before = plan.every;
  }
});

test("while there is time, each flight lands before the next takes off", () => {
  for (const count of [1, 2, 3, 5, 8, 11]) {
    const plan = planFilm(year(count));
    plan.legs.slice(1).forEach((leg, index) => assert.ok(plan.legs[index].land <= leg.start + 1e-9, `${count} flights: flight ${index + 1} is still in the air`));
  }
});

test("a longer flight takes longer to draw than a shorter one in the same film", () => {
  const plan = planFilm([60, 720, 180]);
  const length = plan.legs.map((leg) => leg.land - leg.start);
  assert.ok(length[1] > length[2] && length[2] > length[0]);
  assert.ok(length.every((value) => value > 0));
});

test("a line is not there before take-off, whole on landing, and only ever grows", () => {
  const leg = planFilm([90, 300]).legs[1];
  assert.equal(flown(leg, leg.start - 0.5), 0);
  assert.equal(flown(leg, leg.start), 0);
  assert.equal(flown(leg, leg.land), 1);
  assert.equal(flown(leg, leg.land + 3), 1);
  let last = 0;
  for (let time = leg.start; time <= leg.land; time += 1 / FPS) {
    const share = flown(leg, time);
    assert.ok(share >= last);
    last = share;
  }
});

test("flights with no recorded duration still get a line", () => {
  const plan = planFilm([0, 0, 0]);
  assert.ok(plan.legs.every((leg) => leg.land > leg.start && Number.isFinite(leg.land)));
});

test("flights on one date play in the order they left, even across the date line", () => {
  // Tokyo 17:00 lands in Honolulu that same morning; Honolulu 09:00 leaves after it.
  const tokyo = { id: "NRT-HNL", date: "2025-06-10", depart: "17:00", departAt: Date.UTC(2025, 5, 10, 8) };
  const honolulu = { id: "HNL-LAX", date: "2025-06-10", depart: "09:00", departAt: Date.UTC(2025, 5, 10, 19) };
  assert.deepEqual([honolulu, tokyo].sort(travelOrder).map((flight) => flight.id), ["NRT-HNL", "HNL-LAX"]);
  const unknown = { id: "early", date: "2025-06-10", depart: "06:00" };
  assert.deepEqual([tokyo, unknown].sort(travelOrder).map((flight) => flight.id), ["early", "NRT-HNL"], "without an instant, the local clock decides");
  const next = { id: "next day", date: "2025-06-11", depart: "01:00", departAt: Date.UTC(2025, 5, 10, 1) };
  assert.deepEqual([next, honolulu].sort(travelOrder).map((flight) => flight.id), ["HNL-LAX", "next day"], "the date comes first");
});
