import type { Flight } from "./data";
import { cityName, localeIndex, type Locale } from "./i18n";
import { countryNamesOf, placeOf } from "./atlas";
import type { LngLat } from "./geo";

// Airports that share one metro area under IATA's metropolitan codes, so
// "Shanghai" counts Pudong and Hongqiao together.
const metros: Record<string, string> = {
  PEK: "BJS", PKX: "BJS", PVG: "SHA", SHA: "SHA", HND: "TYO", NRT: "TYO", KIX: "OSA", ITM: "OSA", UKB: "OSA",
  CTS: "SPK", OKD: "SPK", ICN: "SEL", GMP: "SEL", TPE: "TPE", TSA: "TPE", BKK: "BKK", DMK: "BKK", CGK: "JKT",
  HLP: "JKT", KUL: "KUL", SZB: "KUL", DXB: "DXB", DWC: "DXB", IST: "IST", SAW: "IST", LHR: "LON", LGW: "LON",
  STN: "LON", LTN: "LON", LCY: "LON", SEN: "LON", CDG: "PAR", ORY: "PAR", MXP: "MIL", LIN: "MIL", BGY: "MIL",
  FCO: "ROM", CIA: "ROM", ARN: "STO", BMA: "STO", SVO: "MOW", DME: "MOW", VKO: "MOW", JFK: "NYC", EWR: "NYC",
  LGA: "NYC", IAD: "WAS", DCA: "WAS", BWI: "WAS", ORD: "CHI", MDW: "CHI", YYZ: "YTO", YTZ: "YTO", EZE: "BUE",
  AEP: "BUE", GRU: "SAO", CGH: "SAO", VCP: "SAO", GIG: "RIO", SDU: "RIO", CTU: "CTU", TFU: "CTU", NGO: "NGO",
  NKM: "NGO", IAH: "HOU", HOU: "HOU", DFW: "DFW", DAL: "DFW", OSL: "OSL", TRF: "OSL", RYG: "OSL", BRU: "BRU",
  CRL: "BRU", KBP: "IEV", IEV: "IEV",
};

export const metroOf = (code: string) => metros[code] ?? code;

// A metro id (LON, TYO) back to its busiest airport, which names and places the city.
// Every archive carries these airports, so the answer never depends on which
// other codes happen to be known.
const metroHomes: Record<string, string> = {
  BJS: "PEK", TYO: "HND", OSA: "KIX", SPK: "CTS", SEL: "ICN", JKT: "CGK", LON: "LHR", PAR: "CDG",
  MIL: "MXP", ROM: "FCO", STO: "ARN", MOW: "SVO", NYC: "JFK", WAS: "IAD", CHI: "ORD", YTO: "YYZ",
  BUE: "EZE", SAO: "GRU", RIO: "GIG", HOU: "IAH", IEV: "KBP",
};
export const airportOfMetro = (metro: string) => metroHomes[metro] ?? metro;
export const coordinatesOf = (code: string): LngLat => placeOf(code)?.coordinates ?? [0, 0];
// The position when the code is known, so an unknown one is never "near" anything.
export const positionOf = (code: string): LngLat | null => placeOf(code)?.coordinates ?? null;
export const countryOf = (code: string) => placeOf(code)?.country ?? "";
export const cityOf = (code: string, locale: Locale) => cityName(code, locale);
export const countryName = (iso: string, locale: Locale) => countryNamesOf(iso)?.[localeIndex(locale)] ?? iso;

export function airportsIn(list: Flight[]) {
  const visits = new Map<string, number>();
  for (const flight of list) {
    visits.set(flight.origin, (visits.get(flight.origin) ?? 0) + 1);
    visits.set(flight.destination, (visits.get(flight.destination) ?? 0) + 1);
  }
  return visits;
}

export function countriesIn(list: Flight[]) {
  const set = new Set<string>();
  for (const flight of list) { set.add(countryOf(flight.origin)); set.add(countryOf(flight.destination)); }
  set.delete("");
  return set;
}
