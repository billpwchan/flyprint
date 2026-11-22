import type { Archive, Names, Place } from "./data";

// Names and positions for the codes on screen. They are public facts, the same
// for every reader, so one table serves the server and the browser alike; the
// archive a page renders from brings the entries it needs.
const places = new Map<string, Place>();
const carriers = new Map<string, Names>();
const countries = new Map<string, Names>();

export function registerAtlas(archive: Pick<Archive, "places" | "carriers" | "countries">) {
  for (const [code, place] of Object.entries(archive.places)) places.set(code, place);
  for (const [code, names] of Object.entries(archive.carriers)) carriers.set(code, names);
  for (const [code, names] of Object.entries(archive.countries)) countries.set(code, names);
}

export const placeOf = (code: string) => places.get(code);
export const carrierNamesOf = (code: string) => carriers.get(code);
export const countryNamesOf = (iso: string) => countries.get(iso);
