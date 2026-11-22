import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm, readdir, symlink, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { validateArchive } from "../scripts/archive-validation.mjs";
import { isPublicPath, hasPrivateFingerprint } from "../scripts/public-files.mjs";

const root = resolve(import.meta.dirname, "..");
const example = JSON.parse(await readFile(join(root, "app/data/flights.example.json"), "utf8"));
const fresh = () => structuredClone(example);
const invoke = (script, args = [], options = {}) => spawnSync(process.execPath, [join(root, script), ...args], { cwd: root, encoding: "utf8", ...options });
const output = (result) => `${result.stdout || ""}${result.stderr || ""}`;

test("the synthetic demo is a complete shared archive with no registration claims", () => {
  assert.ok(validateArchive(fresh()).flights.length > 0);
  assert.ok(example.flights.some((flight) => flight.travellerIds.length === 2));
  assert.ok(example.flights.every((flight) => flight.aircraft.source === "typical" && !flight.aircraft.registration));
});

test("archive validation rejects broken calendar dates and inconsistent years", () => {
  for (const [date, year] of [["2025-02-29", 2025], ["2026-13-01", 2026], ["2026-06-21", 2025]]) {
    const archive = fresh(); Object.assign(archive.flights[0], { date, year });
    assert.throws(() => validateArchive(archive), /date\/year/);
  }
});

test("duplicate ids and shared-flight duplicates must be resolved before rendering", () => {
  const sameId = fresh(); sameId.flights[1].id = sameId.flights[0].id;
  assert.throws(() => validateArchive(sameId), /id \(duplicate\)/);
  const sameJourney = fresh(); sameJourney.flights.push({ ...sameJourney.flights[0], id: "OTHER" });
  assert.throws(() => validateArchive(sameJourney), /merge travellerIds/);
});

test("airport anchors must be finite coordinates and referenced airports must exist", () => {
  for (const coordinates of [[0, 91], [181, 0], [NaN, 0], [0]]) {
    const archive = fresh(); archive.airports.HKG.coordinates = coordinates;
    assert.throws(() => validateArchive(archive), /coordinates/);
  }
  const archive = fresh(); archive.flights[0].origin = "XXX";
  assert.throws(() => validateArchive(archive), /origin\/destination/);
});

test("invalid ownership, durations and local times are rejected without leaking values", () => {
  for (const values of [{ travellerIds: ["B", "B"] }, { travellerIds: ["SECRET-NAME"] }, { durationMinutes: 0 }, { km: 1.5 }, { arrive: "27:00" }]) {
    const archive = fresh(); Object.assign(archive.flights[0], values);
    assert.throws(() => validateArchive(archive), (error) => !error.message.includes("SECRET-NAME") && /Invalid flight archive/.test(error.message));
  }
});

test("registration claims require operated evidence; signed calendar offsets remain valid", () => {
  const archive = fresh(); archive.flights[0].aircraft.registration = "DEMO-REG";
  assert.throws(() => validateArchive(archive), /requires operated evidence/);
  archive.flights[0].aircraft.source = "operated";
  archive.flights[0].arrivalDayOffset = -1;
  assert.doesNotThrow(() => validateArchive(archive));
});

test("explicit missing archive paths fail instead of silently serving demo data", () => {
  const result = invoke("scripts/prepare-data.mjs", [], { env: { ...process.env, FLIGHT_DATA_PATH: "data/private/not-a-real-archive.json" } });
  assert.notEqual(result.status, 0);
  assert.match(output(result), /FLIGHT_DATA_PATH is set/);
  assert.doesNotMatch(output(result), /Flight archive prepared/);
});

test("env files load before Vite and shell data selection wins", async () => {
  const folder = await mkdtemp(join(tmpdir(), "flyprint-env-test-"));
  try {
    await mkdir(join(folder, "scripts")); await mkdir(join(folder, "app/data"), { recursive: true });
    for (const script of ["prepare-data.mjs", "archive-validation.mjs"]) await writeFile(join(folder, "scripts", script), await readFile(join(root, "scripts", script)));
    await writeFile(join(folder, "app/data/flights.example.json"), JSON.stringify(example));
    await writeFile(join(folder, ".env"), "FLIGHT_DATA_PATH=missing.json\n");
    await writeFile(join(folder, ".env.local"), "FLIGHT_DATA_PATH=app/data/flights.example.json\n");
    const env = { ...process.env }; delete env.FLIGHT_DATA_PATH;
    const local = spawnSync(process.execPath, [join(folder, "scripts/prepare-data.mjs")], { env, encoding: "utf8" });
    assert.equal(local.status, 0, output(local));
    const shell = spawnSync(process.execPath, [join(folder, "scripts/prepare-data.mjs")], { env: { ...env, FLIGHT_DATA_PATH: "missing-shell.json" }, encoding: "utf8" });
    assert.notEqual(shell.status, 0); assert.match(output(shell), /FLIGHT_DATA_PATH is set/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("public file policy excludes private inputs, nested envs, attachments and host records", () => {
  for (const path of [".env", ".envrc", ".env.local", "app/.env.production", "data/private/flights.json", "app/data/flights.generated.json", "app/data/flights.json", "deploy/lightsail/Caddyfile", "deploy/lightsail/compose.yml", "scripts/import_flights.py", "docs/RELEASE_20260912.md", "archive.xlsx", "id_ed25519", "foo.key", "dist/standalone/server.js", ".git/objects/example", ".venv/example", ".ssh/config", "scripts/node_modules/local", "tests/fixtures/real.db", "tests/fixtures/export.csv", "tests/fixtures/sub/key.pem"]) assert.equal(isPublicPath(path), false, path);
  for (const path of [".env.example", "README.md", "app/data/flights.example.json", "deploy/lightsail/Caddyfile.example", ".github/workflows/ci.yml", "tests/fixtures/flighty.csv"]) assert.equal(isPublicPath(path), true, path);
  assert.equal(hasPrivateFingerprint("-----BEGIN PRIVATE KEY-----"), true);
});

test("privacy checker examines untracked files and catches tracked private paths", async () => {
  const folder = await mkdtemp(join(tmpdir(), "flyprint-privacy-test-"));
  try {
    await mkdir(join(folder, "scripts"));
    for (const script of ["privacy-check.mjs", "public-files.mjs"]) await writeFile(join(folder, "scripts", script), await readFile(join(root, "scripts", script)));
    execFileSync("git", ["init", "-q", folder]);
    await writeFile(join(folder, "untracked.md"), "-----BEGIN PRIVATE KEY-----");
    const run = () => spawnSync(process.execPath, [join(folder, "scripts/privacy-check.mjs")], { encoding: "utf8" });
    const untracked = run(); assert.notEqual(untracked.status, 0); assert.match(output(untracked), /untracked.md/);
    await rm(join(folder, "untracked.md")); await writeFile(join(folder, ".env.local"), "TOKEN=demo\n");
    execFileSync("git", ["-C", folder, "add", ".env.local"]);
    const tracked = run(); assert.notEqual(tracked.status, 0); assert.match(output(tracked), /private path/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("export refuses existing, nested and ancestor targets without changing them", async () => {
  for (const target of [root, join(root, "outputs/new-export"), resolve(root, ".."), tmpdir()]) {
    const result = invoke("scripts/export-open-source.mjs", [target]);
    assert.notEqual(result.status, 0);
  }
});

test("export produces a runnable source tree without private artifacts or history", async () => {
  const folder = await mkdtemp(join(tmpdir(), "flyprint-export-test-"));
  try {
    const destination = join(folder, "public");
    const result = invoke("scripts/export-open-source.mjs", [destination]);
    assert.equal(result.status, 0, output(result));
    const entries = await readdir(destination);
    for (const path of [".git", ".env.local", "data", "dist", "node_modules", "AGENTS.md"]) assert.ok(!entries.includes(path), path);
    for (const path of ["README.md", ".env.example", ".github/workflows/ci.yml", "app/data/flights.example.json"]) await access(join(destination, path));
    const scan = invoke("scripts/privacy-check.mjs", ["--directory", destination]);
    assert.equal(scan.status, 0, output(scan));
    await symlink(join(folder, "outside"), join(destination, "escaped"));
    const link = invoke("scripts/privacy-check.mjs", ["--directory", destination]);
    assert.notEqual(link.status, 0); assert.match(output(link), /symbolic links/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
