import airportTable from "./airports.json";
import runwayTable from "./runways.json";
import { airportCode, countryFor, iataOfIcao, placeFor } from "./gazetteer";
import { airportOfMetro, metroOf } from "../places";
import type { Names } from "../data";

// Airports by what a person types: a code, a city or an airport's name in
// any of the three languages. A city with several airports leads with the
// one most flown: the metro's own airport, else the longest runway.

export type AirportMatch = { code: string; city: Names; name: Names; country: string; countryName: Names };

type Entry = { code: string; cities: string[]; names: string[]; weight: number; service: boolean; match: AirportMatch };

// English names for cities the airport table writes in their own language,
// and airport names it leaves out.
const EXONYMS: Record<string, string[]> = {
  VCE: ["Venice"], NAP: ["Naples"], NGO: ["Nagoya"], FLR: ["Florence"], TRN: ["Turin"], GOA: ["Genoa"],
  CIA: ["Rome"], SVQ: ["Seville"], KBP: ["Kyiv"], IEV: ["Kyiv"],
  // Names the table files under the city alone.
  HND: ["Haneda", "羽田"], ITM: ["Itami", "伊丹"],
};

// Air bases and heliports keep their codes but are never what a city name means.
const NOT_SERVICE = /\b(air base|air force|afb|naval|army|military|heliport|airbase)\b/i;

const runways = (runwayTable as unknown as { runways: Record<string, unknown[][]> }).runways;
const codes = Object.keys(airportTable as Record<string, unknown>);

export const fold = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[\s'’.,\-·・()（）]/g, "")
  .replace(/(internationalairport|international|airport|國際機場|国际机场|機場|机场)$/u, "");

let index: Entry[] | null = null;

function entries(): Entry[] {
  if (index) return index;
  const built: Entry[] = [];
  for (const code of codes) {
    const place = placeFor(code, false);
    if (!place) continue;
    const longest = Math.max(0, ...(runways[code] ?? []).map((runway) => Number(runway[7]) || 0));
    const home = airportOfMetro(metroOf(code)) === code && metroOf(code) !== code;
    const service = !NOT_SERVICE.test(place.name[2]);
    built.push({
      code,
      cities: [...new Set([...place.city, ...(EXONYMS[code] ?? [])].map(fold).filter(Boolean))],
      names: [...new Set(place.name.map(fold).filter(Boolean))],
      weight: longest / 1000 + (home ? 5 : 0) - (service ? 0 : 5),
      service,
      match: { code, city: place.city, name: place.name, country: place.country, countryName: countryFor(place.country) ?? [place.country, place.country, place.country] },
    });
  }
  return (index = built);
}

function score(entry: Entry, value: string, upper: string) {
  if (entry.code === upper) return 1000;
  let best = 0;
  for (const city of entry.cities) {
    if (city === value) best = Math.max(best, 500);
    else if (city.startsWith(value)) best = Math.max(best, 300);
    else if (value.length >= 2 && city.includes(value)) best = Math.max(best, 120);
  }
  for (const name of entry.names) {
    if (name === value) best = Math.max(best, 480);
    else if (name.startsWith(value)) best = Math.max(best, 280);
    else if (value.length >= 2 && name.includes(value)) best = Math.max(best, 110);
  }
  return best ? best + entry.weight : 0;
}

export function searchAirports(query: string, limit = 6): AirportMatch[] {
  const trimmed = query.trim().slice(0, 60);
  const value = fold(trimmed);
  if (!value) return [];
  const upper = trimmed.toUpperCase();
  const icao = /^[A-Z]{4}$/.test(upper) ? iataOfIcao(upper) : null;
  // A metro's own code (LON, TYO) lists its airports.
  const metro = /^[A-Z]{3}$/.test(upper) ? upper : null;
  return entries()
    .map((entry) => ({ entry, score: entry.code === icao ? 900 : metro && metroOf(entry.code) === metro && entry.code !== metro ? 800 + entry.weight : score(entry, value, upper) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.code.localeCompare(b.entry.code))
    .slice(0, limit)
    .map((item) => item.entry.match);
}

// What a typed field means, decided only where there is one answer: a code
// written in capitals (HKG, VHHH), a code in lower case that names no place
// (hkg), or a name that exactly one passenger airport in the world answers to,
// with nothing else even partly matching (希思罗, Heathrow, 香港). A city with
// several airports (London, Shanghai, Madrid), a name several countries share
// (Santiago, Lima) or a city spelled like a code (Nan) is the reader's to pick
// from the suggestions: which airport it was is part of the record.
export type Resolved = { code: string } | { ambiguous: true } | { unknown: true };

export function resolveAirport(text: string): Resolved {
  const typed = text.trim();
  const value = fold(typed);
  if (!value) return { unknown: true };
  const capitals = typed === typed.toUpperCase();
  const code = airportCode(typed);
  if (code && capitals && /^[A-Z]{3,4}$/.test(typed)) return { code };
  const upper = typed.toUpperCase();
  const found = entries()
    .map((entry) => ({ entry, score: score(entry, value, upper) }))
    .filter((item) => item.score > 0 && item.score < 900)
    .sort((a, b) => b.score - a.score);
  const named = found.filter((item) => item.score >= 480 && item.entry.service);
  if (code && /^[a-z]{3,4}$/i.test(typed)) return named.length ? { ambiguous: true } : { code };
  // One airport by its full name, and no other whose name starts the same way.
  if (named.length === 1 && !found.some((item) => item.entry !== named[0].entry && item.score >= 280)) return { code: named[0].entry.code };
  // Part of one airport's name and of no other, when that part says something:
  // the start of a name, Chinese characters, or five letters or more (not "nyc").
  const [only] = found;
  if (!named.length && found.length === 1 && only.entry.service && (only.score >= 280 || /\p{Script=Han}/u.test(value) || value.length >= 5)) return { code: only.entry.code };
  return found.length ? { ambiguous: true } : { unknown: true };
}
