import { readFile, readdir, lstat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, relative, join } from "node:path";
import { isPublicPath, isSensitivePath, hasPrivateFingerprint } from "./public-files.mjs";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const directory = args[0] === "--directory" && args[1] ? resolve(args[1]) : null;
if (args.length && (!directory || args.length !== 2)) throw new Error("Usage: privacy-check.mjs [--directory <export-directory>]");
const ignoredScanners = new Set(["scripts/public-files.mjs", "tests/repository-tools.test.mjs"]);

async function filesUnder(base) {
  const paths = [];
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const full = join(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Privacy check refuses symbolic links.");
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) paths.push(relative(base, full).replaceAll("\\", "/"));
    }
  }
  await visit(base);
  return paths;
}

const tracked = directory ? [] : execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
// Deleted legacy files are absent from the publishable working tree. History
// remains a separate release concern; this command makes no history guarantee.
const candidates = directory ? await filesUnder(directory) : execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const base = directory || root;
const failures = [];
let scanned = 0;
for (const path of [...new Set(candidates)]) {
  let buffer;
  try {
    if ((await lstat(resolve(base, path))).isSymbolicLink()) { failures.push(`${path} (symbolic link)`); continue; }
    buffer = await readFile(resolve(base, path));
  } catch (error) { if (error.code === "ENOENT") continue; throw error; }
  if (isSensitivePath(path) && (directory || tracked.includes(path))) { failures.push(`${path} (private path)`); continue; }
  if (!directory && !isPublicPath(path)) continue;
  if (directory && !isPublicPath(path)) { failures.push(`${path} (excluded export path)`); continue; }
  scanned++;
  if (buffer.includes(0) || ignoredScanners.has(path)) continue;
  if (hasPrivateFingerprint(buffer.toString("utf8"))) failures.push(`${path} (private fingerprint)`);
  if (path === "app/data/flights.example.json") {
    const demo = JSON.parse(buffer.toString("utf8"));
    if (demo.generatedFrom !== "synthetic-demo" || !demo.flights.every((flight) => flight.status === "demo" && flight.id.startsWith("DEMO-"))) failures.push(`${path} (must contain synthetic demo records)`);
  }
}
if (failures.length) throw new Error(`Privacy check failed:\n${failures.join("\n")}`);
console.log(`Privacy check passed (${scanned} publishable files, including untracked files). Git history and image contents require a separate review.`);
