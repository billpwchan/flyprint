import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// The world's airports as faint lights for the share cards' night globe, as
// the iOS app draws them: one point per airport at its longest runway, which
// also sets how bright it is. Airports with only short strips stay dark.
// Usage: node scripts/build-lights.mjs (after scripts/build-runways.mjs)

const source = resolve(import.meta.dirname, "../app/lib/server/runways.json");
const output = resolve(import.meta.dirname, "../app/components/cards/lights.json");
const { runways } = JSON.parse(await readFile(source, "utf8"));
const lights = [];
for (const list of Object.values(runways)) {
  let longest = 0, lng = 0, lat = 0;
  for (const [lng1, lat1, lng2, lat2, , , , length] of list) {
    if (length > longest) { longest = length; lng = (lng1 + lng2) / 2; lat = (lat1 + lat2) / 2; }
  }
  if (longest < 1200) continue;
  const level = longest >= 3500 ? 3 : longest >= 2800 ? 2 : longest >= 2000 ? 1 : 0;
  lights.push([Math.round(lng * 100) / 100, Math.round(lat * 100) / 100, level]);
}
lights.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
await writeFile(output, `${JSON.stringify(lights)}\n`);
console.log(`${lights.length} lights → ${output}`);
