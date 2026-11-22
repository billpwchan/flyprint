// Builds the sample archive visitors see before they sign in: two invented
// travellers, nine years of flying, written to app/data/flights.example.json.
//
//   node scripts/build-demo.mjs [seed]
//
// Lin grows up flying out of Shanghai, meets Theo in Portugal in 2019, keeps
// a long-distance relationship with Amsterdam through the years borders were
// shut, and moves there in 2023. Around that story the years fill with trips
// drawn at random from what someone living in each city would plausibly fly:
// family at New Year, work shuttles, city breaks, a few long hauls. Routes,
// airlines, aircraft and clock times are realistic; the people, dates and
// pairings are invented. ANCHOR is "today" for the archive; the server slides
// every date by whole weeks so the booked flights stay ahead of the reader.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateArchive } from "./archive-validation.mjs";

const root = resolve(import.meta.dirname, "..");
const seed = Number(process.argv[2] ?? 20261119);
const ANCHOR = "2026-11-19";
const MOVE = "2023-09-02";

// A flight that someone actually flies on this route: number, local departure,
// block minutes (before and after Russian airspace closed, for long hauls), type.
const ROUTES = {
  // Shanghai and around
  "PVG CTU": [["MU5411", "08:05", 205, "A333"], ["3U8964", "13:40", 200, "A321"], ["MU5403", "17:30", 210, "A359"]],
  "CTU PVG": [["MU5412", "13:10", 170, "A333"], ["3U8963", "19:35", 165, "A321"], ["MU5404", "08:30", 175, "A359"]],
  "SHA CTU": [["MU5405", "10:00", 205, "A333"]],
  "CTU SHA": [["MU5406", "15:30", 175, "A333"]],
  "SHA PEK": [["MU5101", "08:00", 135, "A333"], ["CA1858", "09:30", 140, "B77W"], ["MU5137", "07:00", 130, "A333"]],
  "PEK SHA": [["MU5138", "18:00", 130, "A333"], ["CA1519", "20:30", 135, "B738"], ["MU5156", "21:00", 130, "A333"]],
  "SHA SZX": [["MU5331", "08:35", 160, "A321"]],
  "SZX SHA": [["ZH9517", "15:10", 145, "A320"]],
  "PVG NRT": [["MU523", "09:00", 175, "A333"], ["JL876", "15:05", 175, "B788"]],
  "NRT PVG": [["MU524", "14:30", 195, "A333"], ["JL875", "18:55", 200, "B788"]],
  "PVG HND": [["NH972", "11:40", 170, "B788"]],
  "HND PVG": [["NH971", "09:55", 200, "B788"]],
  "PVG KIX": [["MU729", "09:05", 150, "A321"], ["9C8569", "07:45", 145, "A320"]],
  "KIX PVG": [["MU730", "13:50", 165, "A321"], ["9C8570", "11:20", 160, "A320"]],
  "PVG ICN": [["KE896", "15:05", 120, "A333"], ["OZ362", "12:45", 115, "A321"]],
  "ICN PVG": [["KE893", "09:00", 130, "A333"], ["OZ361", "09:30", 130, "A321"]],
  "PVG CJU": [["7C8802", "16:10", 100, "B738"]],
  "CJU PVG": [["7C8801", "12:30", 110, "B738"]],
  "PVG TPE": [["CI502", "14:55", 120, "A333"], ["BR711", "10:10", 115, "A321"]],
  "TSA SHA": [["CI202", "15:00", 110, "A333"]],
  "TPE PVG": [["CI503", "08:30", 115, "A333"]],
  "PVG HKG": [["CX367", "18:40", 165, "A333"], ["CX369", "10:20", 160, "A359"]],
  "HKG PVG": [["CX366", "13:45", 155, "A333"]],
  "PVG BKK": [["TG665", "16:05", 285, "B788"]],
  "BKK CNX": [["TG102", "08:20", 75, "A320"], ["FD3437", "10:15", 75, "A320"]],
  "CNX BKK": [["FD3438", "13:05", 70, "A320"]],
  "BKK PVG": [["TG662", "16:55", 245, "B788"]],
  "PVG SIN": [["SQ833", "09:45", 330, "A359"]],
  "SIN DPS": [["SQ938", "17:05", 165, "B738"], ["SQ942", "09:10", 165, "B738"]],
  "DPS SIN": [["SQ949", "17:20", 160, "B738"]],
  "SIN PVG": [["SQ836", "23:05", 300, "A359"]],
  "PVG HAN": [["VN531", "19:40", 200, "A321"]],
  "HAN DAD": [["VN159", "08:00", 80, "A321"]],
  "DAD SGN": [["VJ621", "11:30", 85, "A321"]],
  "SGN PVG": [["VN522", "13:30", 265, "A321"]],
  "PVG KMG": [["MU5802", "07:30", 225, "A321"]],
  "KMG LJG": [["MU5915", "10:00", 60, "A320"]],
  "LJG PVG": [["HO1172", "13:40", 215, "A320"]],
  "PVG SYX": [["HO1155", "09:20", 205, "A321"], ["9C8807", "07:00", 200, "A320"]],
  "SYX PVG": [["HO1156", "13:40", 190, "A321"], ["9C8808", "11:35", 185, "A320"]],
  "SHA XIY": [["MU2154", "08:20", 150, "A320"]],
  "XIY SHA": [["MU2153", "16:45", 140, "A320"]],
  "PVG KWL": [["9C8761", "10:35", 160, "A320"]],
  "KWL PVG": [["9C8762", "14:50", 145, "A320"]],
  "PVG HKT": [["9C8545", "07:25", 300, "A320"]],
  "HKT PVG": [["9C8546", "13:10", 270, "A320"]],
  // Between Shanghai and Amsterdam
  "PVG AMS": [["KL896", "23:40", [760, 835], "B789"], ["MU771", "13:05", [745, 820], "A359"]],
  "AMS PVG": [["KL895", "14:15", [650, 770], "B789"], ["MU772", "12:25", [640, 760], "A359"]],
  // Amsterdam and around
  "AMS LHR": [["KL1001", "07:00", 75, "B738"], ["BA431", "09:30", 70, "A320"]],
  "LHR AMS": [["KL1006", "17:45", 70, "B738"], ["BA438", "19:15", 70, "A320"]],
  "AMS BER": [["KL1775", "08:40", 75, "B737"]],
  "BER AMS": [["KL1776", "18:20", 80, "B737"]],
  "AMS MUC": [["KL1795", "07:20", 85, "B738"]],
  "MUC AMS": [["LH2300", "18:20", 90, "A320"]],
  "AMS DUB": [["EI603", "08:25", 85, "A320"]],
  "DUB AMS": [["EI610", "17:40", 85, "A320"]],
  "AMS LIS": [["TP663", "13:15", 175, "A21N"], ["KL1693", "09:30", 175, "B738"]],
  "LIS AMS": [["TP668", "18:45", 170, "A21N"], ["KL1694", "13:00", 170, "B738"]],
  "AMS OPO": [["KL1719", "07:40", 165, "B737"]],
  "OPO AMS": [["KL1720", "11:40", 165, "B737"]],
  "AMS BCN": [["VY8302", "10:20", 130, "A320"], ["KL1665", "09:10", 130, "B738"]],
  "BCN AMS": [["VY8305", "16:10", 135, "A320"], ["KL1670", "20:15", 135, "B738"]],
  "AMS FCO": [["KL1599", "09:10", 135, "B738"]],
  "FCO AMS": [["KL1604", "17:50", 145, "B738"]],
  "AMS ATH": [["KL1575", "09:00", 195, "B738"]],
  "ATH JTR": [["A3360", "12:30", 45, "A320"]],
  "JTR ATH": [["A3367", "13:00", 45, "A320"]],
  "ATH AMS": [["KL1576", "15:30", 210, "B738"]],
  "AMS RAK": [["HV5545", "10:35", 230, "B738"]],
  "RAK AMS": [["HV5546", "15:20", 220, "B738"]],
  "AMS CPH": [["SK552", "10:05", 80, "A20N"]],
  "CPH AMS": [["SK551", "17:00", 85, "A20N"]],
  "AMS VIE": [["OS372", "12:50", 105, "A320"]],
  "VIE AMS": [["OS371", "10:00", 115, "A320"]],
  "AMS NCE": [["KL1263", "09:35", 125, "B738"]],
  "NCE AMS": [["KL1264", "12:40", 130, "B738"]],
  "AMS KEF": [["FI501", "14:00", 190, "B38M"]],
  "KEF AMS": [["FI500", "07:40", 185, "B38M"]],
  "AMS GVA": [["KL1925", "09:50", 85, "B737"]],
  "GVA AMS": [["KL1932", "18:30", 90, "B737"]],
  "AMS PRG": [["KL1351", "08:40", 85, "B737"]],
  "PRG AMS": [["KL1354", "14:30", 90, "B737"]],
  "AMS EDI": [["KL1281", "09:50", 85, "B737"]],
  "EDI AMS": [["KL1284", "13:40", 85, "B737"]],
  "AMS HND": [["KL861", "14:40", [690, 860], "B789"]],
  "HND AMS": [["KL862", "22:25", [745, 870], "B789"]],
  "AMS ICN": [["KL855", "14:25", [640, 790], "B789"]],
  "ICN KIX": [["KE723", "09:00", 105, "A333"]],
  "KIX AMS": [["KL868", "10:50", [730, 870], "B789"]],
  "AMS JFK": [["KL641", "10:40", 505, "A333"], ["DL47", "13:20", 510, "A333"]],
  "JFK SFO": [["B6415", "08:00", 385, "A21N"]],
  "SFO HNL": [["UA1158", "09:30", 330, "B772"]],
  "HNL SFO": [["UA1196", "22:00", 300, "B772"]],
  "SFO AMS": [["KL606", "14:15", 650, "B78X"]],
  "JFK AMS": [["KL642", "17:55", 445, "A333"]],
  "AMS CPT": [["KL597", "10:15", 700, "B789"]],
  "CPT AMS": [["KL598", "19:20", 715, "B789"]],
  "AMS DXB": [["EK148", "15:15", 400, "B77W"]],
  "DXB MLE": [["EK652", "02:40", 260, "B77W"]],
  "MLE DXB": [["EK653", "09:50", 270, "B77W"]],
  "DXB AMS": [["EK147", "15:05", 425, "B77W"]],
  "AMS SIN": [["KL835", "10:45", 765, "B77W"]],
  "SIN AMS": [["KL836", "23:15", 805, "B77W"]],
  "AMS BKK": [["KL875", "17:30", 655, "B77W"]],
  "BKK HKT": [["TG201", "11:00", 80, "A320"], ["TG205", "14:00", 80, "A320"]],
  "HKT BKK": [["TG206", "16:30", 85, "A320"]],
  "BKK AMS": [["KL876", "23:40", 720, "B77W"]],
  "AMS PEK": [["KL897", "17:35", [570, 650], "B789"]],
  "PEK AMS": [["KL898", "11:35", [645, 760], "B789"]],
};

const AIRCRAFT = {
  A320: ["Airbus A320", "narrowbody"], A321: ["Airbus A321", "narrowbody"], A20N: ["Airbus A320neo", "narrowbody"], A21N: ["Airbus A321neo", "narrowbody"],
  A333: ["Airbus A330-300", "widebody"], A359: ["Airbus A350-900", "widebody"], B737: ["Boeing 737-700", "narrowbody"], B738: ["Boeing 737-800", "narrowbody"],
  B38M: ["Boeing 737 MAX 8", "narrowbody"], B772: ["Boeing 777-200", "widebody"], B77W: ["Boeing 777-300ER", "widebody"], B788: ["Boeing 787-8", "widebody"],
  B789: ["Boeing 787-9", "widebody"], B78X: ["Boeing 787-10", "widebody"],
};

// Trips as steps: a route, then either the nights before the next leg or
// "conn" for a connection the same day the last leg landed. A step whose
// origin is not where the last leg landed was reached by train or ferry.
const LIN_SHANGHAI = [
  { weight: 1, legs: (r) => [["PVG CTU"], ["CTU PVG", r.int(3, 5)]] },
  { weight: 1, legs: (r) => [["SHA CTU"], ["CTU SHA", r.int(2, 4)]] },
  { weight: 3, legs: (r) => [["SHA PEK"], ["PEK SHA", r.int(1, 3)]] },
  { weight: 1, legs: () => [["SHA PEK", 0, 2], ["PEK SHA", 0, 2]] },
  { weight: 1, legs: (r) => [["SHA SZX"], ["SZX SHA", r.int(1, 2)]] },
  { weight: 2, legs: (r) => [["PVG NRT"], ["NRT PVG", r.int(4, 7)]], abroad: true },
  { weight: 2, legs: (r) => [["PVG KIX"], ["NRT PVG", r.int(5, 8)]], abroad: true },
  { weight: 1, legs: (r) => [["PVG HND"], ["HND PVG", r.int(3, 5)]], abroad: true },
  { weight: 2, legs: (r) => [["PVG ICN"], ["ICN PVG", r.int(3, 5)]], abroad: true },
  { weight: 1, legs: (r) => [["PVG CJU"], ["CJU PVG", r.int(3, 4)]], abroad: true },
  { weight: 1, legs: (r) => [["PVG TPE"], ["TSA SHA", r.int(3, 5)]], abroad: true },
  { weight: 1, legs: (r) => [["PVG HKG"], ["HKG PVG", r.int(2, 4)]], abroad: true },
  { weight: 1, legs: (r) => [["PVG BKK"], ["BKK CNX", r.int(2, 3)], ["CNX BKK", r.int(3, 4)], ["BKK PVG", "conn"]], abroad: true },
  { weight: 1, legs: (r) => [["PVG SIN"], ["SIN DPS", "conn", 0], ["DPS SIN", r.int(5, 7)], ["SIN PVG", "conn"]], abroad: true },
  { weight: 1, legs: (r) => [["PVG HAN"], ["HAN DAD", r.int(2, 3)], ["DAD SGN", r.int(3, 4)], ["SGN PVG", r.int(2, 3)]], abroad: true },
  { weight: 1, legs: (r) => [["PVG HKT"], ["HKT PVG", r.int(4, 6)]], abroad: true },
  { weight: 2, legs: (r) => [["PVG KMG"], ["KMG LJG", r.int(1, 2)], ["LJG PVG", r.int(3, 4)]] },
  { weight: 2, legs: (r) => [["PVG SYX"], ["SYX PVG", r.int(3, 5)]] },
  { weight: 1, legs: (r) => [["SHA XIY"], ["XIY SHA", r.int(2, 3)]] },
  { weight: 1, legs: (r) => [["PVG KWL"], ["KWL PVG", r.int(3, 4)]] },
];
const THEO = [
  { weight: 4, legs: (r) => [["AMS LHR"], ["LHR AMS", r.int(1, 3)]] },
  { weight: 2, legs: (r) => [["AMS BER"], ["BER AMS", r.int(2, 4)]] },
  { weight: 1, legs: (r) => [["AMS MUC"], ["MUC AMS", r.int(1, 2)]] },
  { weight: 1, legs: (r) => [["AMS GVA"], ["GVA AMS", r.int(5, 7)]], winter: true },
  { weight: 1, legs: (r) => [["AMS BCN"], ["BCN AMS", r.int(3, 5)]] },
  { weight: 1, legs: (r) => [["AMS PRG"], ["PRG AMS", r.int(2, 3)]] },
  { weight: 1, legs: (r) => [["AMS EDI"], ["EDI AMS", r.int(2, 4)]] },
  { weight: 1, legs: (r) => [["AMS DUB"], ["DUB AMS", r.int(2, 3)]] },
];
const LIN_AMSTERDAM = [
  { weight: 3, legs: (r) => [["AMS LHR"], ["LHR AMS", r.int(1, 2)]] },
  { weight: 2, legs: (r) => [["AMS MUC"], ["MUC AMS", r.int(1, 2)]] },
  { weight: 1, legs: (r) => [["AMS DUB"], ["DUB AMS", r.int(1, 2)]] },
  { weight: 1, legs: (r) => [["AMS BER"], ["BER AMS", r.int(2, 3)]] },
];
const TOGETHER = [
  { weight: 2, legs: (r) => [["AMS LIS"], ["LIS AMS", r.int(3, 5)]] },
  { weight: 2, legs: (r) => [["AMS BCN"], ["BCN AMS", r.int(3, 5)]] },
  { weight: 1, legs: (r) => [["AMS FCO"], ["FCO AMS", r.int(3, 5)]] },
  { weight: 1, legs: (r) => [["AMS ATH"], ["ATH JTR", r.int(1, 2)], ["JTR ATH", r.int(3, 4)], ["ATH AMS", "conn"]], summer: true },
  { weight: 1, legs: (r) => [["AMS RAK"], ["RAK AMS", r.int(4, 6)]] },
  { weight: 1, legs: (r) => [["AMS CPH"], ["CPH AMS", r.int(2, 3)]] },
  { weight: 1, legs: (r) => [["AMS VIE"], ["VIE AMS", r.int(3, 4)]] },
  { weight: 1, legs: (r) => [["AMS NCE"], ["NCE AMS", r.int(4, 6)]], summer: true },
  { weight: 1, legs: (r) => [["AMS PRG"], ["PRG AMS", r.int(2, 3)]] },
  { weight: 1, legs: (r) => [["AMS EDI"], ["EDI AMS", r.int(3, 4)]] },
];

function random(seedValue) {
  let state = seedValue >>> 0;
  const next = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (list) => list[Math.floor(next() * list.length)], weighted: (list) => { const total = list.reduce((sum, item) => sum + item.weight, 0); let at = next() * total; return list.find((item) => (at -= item.weight) < 0) ?? list.at(-1); } };
}
const rng = random(seed);

const airports = JSON.parse(readFileSync(join(root, "app/lib/server/airports.json")));
const curated = JSON.parse(readFileSync(join(root, "app/lib/server/names.json"))).places;
const built = JSON.parse(readFileSync(join(root, "app/lib/server/places.json")));
const countries = JSON.parse(readFileSync(join(root, "app/lib/server/countries.json")));

const DAY = 86_400_000;
const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / DAY;
const dateOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);
const minutesOf = (clock) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
const clockOf = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
function offset(zone, instant) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(instant).map((part) => [part.type, part.value]));
  return (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - instant) / 60_000;
}
function instantAt(date, clock, zone) {
  const local = Date.parse(`${date}T00:00:00Z`) + minutesOf(clock) * 60_000;
  let guess = local - offset(zone, local) * 60_000;
  guess = local - offset(zone, guess) * 60_000;
  return guess;
}
function localAt(instant, zone) {
  const shifted = instant + offset(zone, instant) * 60_000;
  return { date: dateOf(Math.floor(shifted / DAY)), clock: clockOf(Math.round((shifted % DAY) / 60_000)) };
}
function km(a, b) {
  const [lon1, lat1] = airports[a], [lon2, lat2] = airports[b];
  const rad = Math.PI / 180;
  const h = Math.sin((lat2 - lat1) * rad / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

// One flight on a given local date, with its landing in the destination's clock.
function fly(route, date, option) {
  const [origin, destination] = route.split(" ");
  const options = ROUTES[route];
  if (!options) throw new Error(`No route ${route}`);
  const [flight, depart, block, icao] = options[option ?? rng.int(0, options.length - 1)] ?? options[0];
  const minutes = Array.isArray(block) ? (date < "2022-03-01" ? block[0] : block[1]) : block;
  const leaves = instantAt(date, depart, airports[origin][3]);
  const lands = leaves + minutes * 60_000;
  const arrival = localAt(lands, airports[destination][3]);
  const [model, body] = AIRCRAFT[icao];
  return {
    date, origin, destination, flight, airline: flight.slice(0, 2), depart, arrive: arrival.clock,
    arrivalDayOffset: dayNumber(arrival.date) - dayNumber(date), durationMinutes: minutes, km: km(origin, destination),
    aircraft: { model, icao, source: "typical", body }, leaves, lands, landedOn: arrival.date,
  };
}

// Steps from a template into flights starting on a date.
function plan(steps, start) {
  const flights = [];
  for (const [route, after, option] of steps) {
    const last = flights.at(-1);
    let date = start;
    if (last) {
      if (after === "conn") {
        date = last.landedOn;
        const candidate = fly(route, date, option);
        if (candidate.leaves - last.lands < 60 * 60_000) date = dateOf(dayNumber(date) + 1);
      } else date = dateOf(dayNumber(last.landedOn) + after);
    }
    const flight = fly(route, date, option);
    if (last && flight.leaves <= last.lands) throw new Error(`${route} on ${date} leaves before ${last.flight} lands`);
    flights.push(flight);
  }
  return flights;
}

// Each person's calendar: the days they are already away or travelling.
const busy = { B: [], Z: [] };
const span = (flights) => [dayNumber(flights[0].date) - 4, dayNumber(flights.at(-1).landedOn) + 4];
const free = (who, flights) => { const [from, to] = span(flights); return who.every((id) => busy[id].every(([a, b]) => to < a || from > b)); };
const archive = [];
function book(who, flights) {
  for (const id of who) busy[id].push(span(flights));
  for (const flight of flights) archive.push({ ...flight, who });
}

// The story, at fixed points.
const story = [
  // They meet in Lisbon and fly home from Porto together.
  [["B"], [["PVG AMS", 0, 0], ["AMS LIS", "conn", 0]], "2019-09-14"],
  [["Z"], [["AMS LIS", 0, 1]], "2019-09-17"],
  [["B", "Z"], [["OPO AMS"]], "2019-09-24"],
  [["B"], [["AMS PVG", 0, 0]], "2019-09-27"],
  [["Z"], [["AMS PVG", 0, 0], ["PVG AMS", 12, 0]], "2019-12-20"],
  [["B", "Z"], [["PVG KWL"], ["KWL PVG", 3]], "2019-12-24"],
  [["B"], [["PVG AMS", 0, 1], ["AMS PVG", 10, 1]], "2020-01-04"],
  [["B", "Z"], [["AMS CPH"], ["CPH AMS", 2]], "2020-01-08"],
  [["B"], [["PVG AMS", 0, 0], ["AMS PVG", 16, 0]], "2023-02-03"],
  [["B", "Z"], [["AMS KEF"], ["KEF AMS", 4]], "2023-02-08"],
  [["Z"], [["AMS PVG", 0, 0], ["PVG AMS", 14, 0]], "2023-04-27"],
  [["B", "Z"], [["PVG KIX"], ["NRT PVG", 6]], "2023-04-30"],
  [["B"], [["PVG AMS", 0, 0]], MOVE],
  // New Year with family in Chengdu.
  [["B"], [["PVG CTU", 0, 0], ["CTU PVG", 8, 0]], "2018-02-13"],
  [["B"], [["SHA CTU"], ["CTU SHA", 7]], "2019-02-02"],
  [["B"], [["PVG CTU", 0, 1], ["CTU PVG", 6, 1]], "2020-01-21"],
  [["B"], [["PVG CTU", 0, 2], ["CTU PVG", 9, 2]], "2022-01-28"],
  [["B"], [["PVG CTU", 0, 0], ["CTU PVG", 7, 0]], "2023-01-19"],
  [["B", "Z"], [["AMS HND"], ["HND AMS", 11]], "2024-04-05"],
  [["B"], [["AMS PVG", 0, 1], ["PVG CTU", "conn", 1], ["CTU PVG", 9, 2], ["PVG AMS", "conn", 1]], "2024-02-06"],
  [["B", "Z"], [["AMS PVG", 0, 1], ["PVG CTU", "conn", 1], ["CTU PVG", 8, 2], ["PVG AMS", "conn", 1]], "2025-01-24"],
  [["B", "Z"], [["AMS JFK", 0, 0], ["JFK SFO", 5], ["SFO HNL", 4], ["HNL SFO", 6], ["SFO AMS", "conn"]], "2024-09-12"],
  [["B", "Z"], [["AMS CPT"], ["CPT AMS", 12]], "2025-10-30"],
  [["B", "Z"], [["AMS DXB"], ["DXB MLE", "conn"], ["MLE DXB", 7], ["DXB AMS", "conn"]], "2026-03-14"],
  [["B", "Z"], [["AMS ATH"], ["ATH JTR", 1], ["JTR ATH", 4], ["ATH AMS", "conn"]], "2026-06-11"],
  // Booked: still ahead of ANCHOR.
  [["B"], [["AMS LHR", 0, 1], ["LHR AMS", 1, 1]], "2026-11-26"],
  [["B", "Z"], [["AMS ICN"], ["ICN KIX", 6], ["KIX AMS", 7]], "2026-12-18"],
  [["B"], [["AMS PVG", 0, 1], ["PVG CTU", "conn", 1], ["CTU PVG", 10, 2], ["PVG AMS", "conn", 1]], "2027-02-03"],
];
// Story pieces overlap one another on purpose; the check at the end keeps
// each person in one place at a time.
for (const [who, steps, date] of story) book(who, plan(steps, date));
// Theo's long trips before Lin.
for (const [steps, date] of [
  [[["AMS SIN"], ["SIN DPS", "conn", 1], ["DPS SIN", 12], ["SIN AMS", "conn"]], "2018-07-20"],
  [[["AMS JFK", 0, 0], ["JFK AMS", 6]], "2017-10-05"],
  [[["AMS BKK"], ["BKK HKT", "conn", 1], ["HKT BKK", 9], ["BKK AMS", "conn"]], "2019-02-08"],
  [[["AMS PEK"], ["PEK AMS", 6]], "2018-04-12"],
]) book(["Z"], plan(steps, date));

// Around the story, each year fills with trips that fit.
const closedAbroad = ["2020-02-01", "2023-01-08"];
const lockdowns = [["2020-01-28", "2020-05-01"], ["2022-03-28", "2022-06-01"]];
const within = (date, [from, to]) => date >= from && date < to;
// A year has each kind of trip at most once, apart from the shuttles the
// pools weight heavily (work, a weekend in London).
function fill(who, pool, from, to, count, rules = {}) {
  let placed = 0;
  const used = new Set();
  for (let attempt = 0; placed < count && attempt < count * 60; attempt++) {
    const template = rng.weighted(pool);
    if (template.weight < 3 && used.has(template)) continue;
    const day = rng.int(dayNumber(from), dayNumber(to) - 1);
    const date = dateOf(day);
    const month = Number(date.slice(5, 7));
    if (template.winter && ![1, 2, 3, 12].includes(month)) continue;
    if (template.summer && ![5, 6, 7, 8, 9].includes(month)) continue;
    if (rules.home && lockdowns.some((range) => within(date, range))) continue;
    if (template.abroad && within(date, closedAbroad)) continue;
    const flights = plan(template.legs(rng), date);
    if (flights.at(-1).landedOn >= to || !free(who, flights)) continue;
    book(who, flights);
    used.add(template);
    placed++;
  }
}
for (let year = 2017; year <= 2026; year++) {
  const start = `${year}-01-01`, end = `${year + 1}-01-01`;
  const quiet = year === 2020 || year === 2021 || year === 2022;
  // Lin: Shanghai until the move, Amsterdam after.
  if (year <= 2023) fill(["B"], quiet ? LIN_SHANGHAI.filter((item) => !item.abroad) : LIN_SHANGHAI, year === 2017 ? "2017-03-01" : start, year === 2023 ? MOVE : end, quiet ? (year === 2022 ? 2 : 4) : 8, { home: true });
  if (year >= 2023) fill(["B"], LIN_AMSTERDAM, year === 2023 ? "2023-09-20" : start, year === 2026 ? ANCHOR : end, 3);
  // Theo: Amsterdam throughout; together with Lin once she lives there.
  fill(["Z"], THEO, year === 2017 ? "2017-03-01" : start, year === 2026 ? ANCHOR : end, quiet ? 2 : 5);
  if (year >= 2023) fill(["B", "Z"], TOGETHER, year === 2023 ? "2023-09-20" : start, year === 2026 ? ANCHOR : end, year === 2023 ? 1 : 4);
}

// Each person is in one place at a time: every flight leaves after the last
// one landed, from where it landed, a city sharing its airports, or a train ride away.
archive.sort((a, b) => a.leaves - b.leaves);
const sameCity = [["PVG", "SHA"], ["NRT", "HND"], ["TPE", "TSA"]];
const byLand = [["LIS", "OPO"], ["KIX", "NRT"]];
const pairIn = (pairs, a, b) => pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
for (const id of ["B", "Z"]) {
  const own = archive.filter((flight) => flight.who.includes(id));
  own.slice(1).forEach((flight, index) => {
    const last = own[index];
    if (flight.leaves <= last.lands) throw new Error(`${id}: ${flight.flight} ${flight.date} leaves before ${last.flight} lands`);
    if (flight.origin !== last.destination && !pairIn(sameCity, flight.origin, last.destination) && !pairIn(byLand, flight.origin, last.destination)) {
      throw new Error(`${id}: ${flight.flight} ${flight.date} leaves ${flight.origin} after landing at ${last.destination}`);
    }
  });
}

// Into the archive format.
const flights = archive.map((flight, index) => ({
  id: `DEMO-${String(index + 1).padStart(3, "0")}`,
  date: flight.date, year: Number(flight.date.slice(0, 4)), airline: flight.airline, flight: flight.flight,
  origin: flight.origin, destination: flight.destination, depart: flight.depart, arrive: flight.arrive,
  arrivalDayOffset: flight.arrivalDayOffset, durationMinutes: flight.durationMinutes, timeSource: "historical_schedule",
  km: flight.km, status: "demo", source: "synthetic", confidence: "confirmed",
  travellerId: flight.who[0], travellerIds: flight.who, aircraft: flight.aircraft,
}));
const codes = [...new Set(flights.flatMap((flight) => [flight.origin, flight.destination]))].sort();
const nameOf = (code) => {
  const [lon, lat, iso, , city, name] = airports[code];
  const local = curated[code] ? { city: curated[code].city[0], name: curated[code].name[0] } : built[code] ? { city: built[code][0] || city, name: built[code][2] || name } : { city, name };
  return { name: local.name, code, city: local.city, country: countries[iso]?.[0] ?? iso, coordinates: [lon, lat] };
};
const result = {
  generatedFrom: "synthetic-demo",
  anchor: ANCHOR,
  seed,
  travellers: [{ id: "B", label: "Lin", accent: "cyan" }, { id: "Z", label: "Theo", accent: "violet" }],
  airports: Object.fromEntries(codes.map((code) => [code, nameOf(code)])),
  flights,
};
validateArchive(result);
writeFileSync(join(root, "app/data/flights.example.json"), `${JSON.stringify(result, null, 1)}\n`);
const count = (id) => flights.filter((flight) => flight.travellerIds.includes(id)).length;
console.log(`${flights.length} flights (Lin ${count("B")}, Theo ${count("Z")}, together ${flights.filter((flight) => flight.travellerIds.length === 2).length}), ${codes.length} airports, ${new Set(flights.map((flight) => flight.airline)).size} airlines, ${flights.filter((flight) => flight.date > ANCHOR).length} booked`);
