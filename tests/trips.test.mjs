import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "rolldown";

const root = resolve(import.meta.dirname, "..");
const scratch = await mkdtemp(join(tmpdir(), "flyprint-trips-"));
const entry = join(scratch, "entry.ts");
await import("node:fs/promises").then(({ writeFile }) => writeFile(entry, `
export { registerAtlas } from ${JSON.stringify(join(root, "app/lib/atlas.ts"))};
export { buildTrips } from ${JSON.stringify(join(root, "app/lib/trips.ts"))};
export { residenceOf, homeOn, mainHome } from ${JSON.stringify(join(root, "app/lib/residence.ts"))};
`));
await build({ input: entry, platform: "node", output: { file: join(scratch, "trips.mjs"), format: "esm" }, logLevel: "silent" });
const { registerAtlas, buildTrips, residenceOf, homeOn, mainHome } = await import(pathToFileURL(join(scratch, "trips.mjs")).href);
test.after(() => rm(scratch, { recursive: true, force: true }));

const at = { VIE: [16.570, 48.110], BTS: [17.213, 48.170], LIS: [-9.136, 38.774], OPO: [-8.681, 41.248], ATH: [23.944, 37.936], DUB: [-6.270, 53.421], TFS: [-16.573, 28.044], YVR: [-123.184, 49.195], SEA: [-122.309, 47.449], YUL: [-73.741, 45.468], YHZ: [-63.509, 44.881] };
registerAtlas({ places: Object.fromEntries(Object.entries(at).map(([code, coordinates]) => [code, { city: [code, code, code], name: [code, code, code], country: "", coordinates }])), carriers: {}, countries: {} });

let serial = 0;
const leg = (date, origin, destination, depart = "10:00", arrive = "14:00", arrivalDayOffset = 0) =>
  ({ id: `f${++serial}`, date, year: Number(date.slice(0, 4)), airline: "XX", flight: `XX${serial}`, origin, destination, depart, arrive, arrivalDayOffset, durationMinutes: 240, timeSource: "recorded", km: 1000 });
const shape = (trip) => `${trip.kind} ${trip.flights[0].origin}-${trip.flights.map((flight) => flight.destination).join("-")}`;

test("a move makes the new city home: later trips start there, and visits to the old one are trips", () => {
  const archive = [
    leg("2025-01-10", "VIE", "LIS"), leg("2025-01-15", "LIS", "VIE"),
    leg("2025-03-01", "VIE", "YUL"),
    leg("2025-05-01", "YUL", "VIE"), leg("2025-05-04", "VIE", "YUL"),
    leg("2025-07-01", "YUL", "VIE"), leg("2025-07-05", "VIE", "YUL"),
    leg("2025-09-02", "YUL", "YHZ"), leg("2025-09-06", "YHZ", "YUL"),
    leg("2025-11-01", "YUL", "VIE"), leg("2025-11-06", "VIE", "YUL"),
  ];
  const trips = buildTrips(archive).reverse();
  assert.deepEqual(trips.map(shape), ["round VIE-LIS-VIE", "move VIE-YUL", "round YUL-VIE-YUL", "round YUL-VIE-YUL", "round YUL-YHZ-YUL", "round YUL-VIE-YUL"]);
  const halifax = trips[4];
  assert.equal(halifax.nights, 4);
  assert.equal(halifax.destination, "YHZ");
  assert.equal(homeOn(archive, "2025-02-01"), "VIE");
  assert.equal(homeOn(archive, "2025-10-01"), "YUL");
});

test("Vienna and Bratislava are one place to live, so flying out of either starts a trip from home", () => {
  const archive = [
    leg("2024-01-01", "VIE", "LIS"), leg("2024-01-06", "LIS", "VIE"),
    leg("2024-02-10", "BTS", "ATH"), leg("2024-02-20", "ATH", "BTS"),
    leg("2024-04-01", "VIE", "TFS"), leg("2024-04-05", "TFS", "BTS"),
  ];
  const trips = buildTrips(archive).reverse();
  assert.deepEqual(trips.map(shape), ["round VIE-LIS-VIE", "round BTS-ATH-BTS", "round VIE-TFS-BTS"]);
  assert.deepEqual(trips.map((trip) => trip.nights), [5, 10, 4]);
});

test("a summer back with family stays a trip; half a year abroad becomes a home", () => {
  const summer = [
    leg("2023-01-05", "VIE", "LIS"), leg("2023-01-09", "LIS", "VIE"),
    leg("2023-06-01", "VIE", "ATH"), leg("2023-09-25", "ATH", "VIE"),
    leg("2023-11-05", "VIE", "TFS"), leg("2023-11-09", "TFS", "VIE"),
  ];
  assert.deepEqual(buildTrips(summer).reverse().map(shape), ["round VIE-LIS-VIE", "round VIE-ATH-VIE", "round VIE-TFS-VIE"]);
  assert.equal(residenceOf(summer).homes.length, 1);

  const abroad = [
    leg("2022-01-05", "VIE", "LIS"), leg("2022-01-09", "LIS", "VIE"),
    leg("2022-02-01", "VIE", "YVR"), leg("2022-04-01", "YVR", "SEA"), leg("2022-04-04", "SEA", "YVR"), leg("2022-09-01", "YVR", "VIE"),
    leg("2022-10-05", "VIE", "TFS"), leg("2022-10-09", "TFS", "VIE"), leg("2022-12-05", "VIE", "TFS"), leg("2022-12-09", "TFS", "VIE"),
  ];
  assert.deepEqual(buildTrips(abroad).reverse().map(shape), ["round VIE-LIS-VIE", "move VIE-YVR", "round YVR-SEA-YVR", "move YVR-VIE", "round VIE-TFS-VIE", "round VIE-TFS-VIE"]);
  assert.equal(mainHome(abroad), "YVR", "more nights in Vancouver than at home that year");
});

test("legs are joined by connections, stays and stretches on the ground", () => {
  const archive = [
    leg("2024-05-01", "VIE", "TFS", "09:00", "11:00"), leg("2024-05-01", "TFS", "YVR", "13:30", "20:00"),
    leg("2024-05-05", "YVR", "SEA"), leg("2024-05-09", "SEA", "VIE", "12:00", "07:00", 1),
    leg("2024-07-01", "VIE", "LIS"), leg("2024-07-06", "OPO", "VIE"),
    leg("2024-08-01", "VIE", "DUB", "08:00", "11:00"), leg("2024-08-01", "DUB", "VIE", "18:00", "21:30"),
  ];
  const [daytrip, portugal, west] = buildTrips(archive);
  assert.deepEqual(west.gaps.map((gap) => [gap.kind, gap.nights, gap.minutes]), [["connection", 0, 150], ["stay", 4, 5160], ["stay", 4, 5640]]);
  assert.deepEqual(west.stays, ["YVR", "SEA"]);
  assert.equal(west.kind, "round");
  assert.equal(portugal.kind, "round");
  assert.deepEqual(portugal.gaps.map((gap) => [gap.kind, gap.at, gap.to, gap.nights]), [["ground", "LIS", "OPO", 5]]);
  assert.deepEqual(portugal.stays, ["LIS", "OPO"]);
  assert.equal(daytrip.kind, "round");
  assert.equal(daytrip.nights, 0);
  assert.equal(daytrip.gaps[0].kind, "stay", "a same-day turnaround is a visit, not a connection");
});

test("a night in the city before the next flight is a stay; a wait at the airport is a connection", () => {
  const archive = [
    leg("2024-06-01", "VIE", "ATH", "07:30", "11:15"), leg("2024-06-02", "ATH", "DUB", "10:00", "12:20"), leg("2024-06-06", "DUB", "VIE"),
    leg("2024-09-01", "VIE", "YVR", "23:30", "05:30", 1), leg("2024-09-02", "YVR", "SEA", "15:20", "17:30"), leg("2024-09-06", "SEA", "VIE", "12:00", "07:00", 1),
  ];
  const [west, south] = buildTrips(archive);
  assert.deepEqual(south.gaps.map((gap) => [gap.kind, gap.minutes]), [["stay", 1365], ["stay", 5620]]);
  assert.deepEqual(west.gaps.map((gap) => [gap.kind, gap.minutes]), [["connection", 590], ["stay", 5430]]);
});

test("a long silence between far-apart airports ends one trip and begins another", () => {
  const archive = [
    leg("2019-04-01", "VIE", "YVR"), leg("2019-06-01", "YVR", "ATH"),
    leg("2020-03-01", "DUB", "VIE"),
  ];
  assert.deepEqual(buildTrips(archive).reverse().map(shape), ["outbound VIE-YVR-ATH", "return DUB-VIE"]);
});
