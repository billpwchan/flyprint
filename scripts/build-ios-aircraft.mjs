// Writes the side views the web draws (app/lib/aircraft) as data for the iOS
// app, so both draw the same measured outlines: ios/Flyprint/Resources/aircraft.json.
// Run with Node 23.6 or later, which loads the TypeScript sources directly.
import { writeFileSync } from "node:fs";
import { aircraftTypes } from "../app/lib/aircraft/catalog.ts";
import { draw } from "../app/lib/aircraft/profile.ts";

const round = (d) => d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 1000) / 1000));
const out = {};
for (const [icao, type] of aircraftTypes) {
  const drawing = draw(type.variant);
  out[icao] = {
    maker: type.maker,
    name: type.name,
    length: type.variant.length,
    top: drawing.top,
    bottom: drawing.bottom,
    half: drawing.half,
    parts: drawing.parts.map((part) => [part.kind, round(part.d)]),
  };
}
writeFileSync("ios/Flyprint/Resources/aircraft.json", JSON.stringify(out));
console.log(`${Object.keys(out).length} types`);
