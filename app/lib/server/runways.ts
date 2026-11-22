import table from "./runways.json";
import type { AirportRunways, Runway } from "../runways";
import { metroOf } from "../places";

const { runways, unsurveyed } = table as unknown as { runways: Record<string, Runway[]>; unsurveyed: Record<string, number[]> };

// Every airport of a metro area with at least one surveyed runway.
export function runwaysOfMetro(metro: string) {
  const found: Record<string, AirportRunways> = {};
  for (const code of Object.keys(runways)) if (metroOf(code) === metro) found[code] = { runways: runways[code], unsurveyed: unsurveyed[code] ?? [] };
  return found;
}
