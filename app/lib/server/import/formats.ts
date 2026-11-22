import { airport, airportCode } from "../gazetteer";
import { dayOfDateTime, dayOrderOf, parseClock, parseDay, today, type DayOrder } from "./dates";
import { blank, type Candidate } from "./types";

// Exports with a known layout, read without the model. Each reader returns
// null when the file is not its format, so the next one can try.

type Table = string[][];
const key = (text: string) => text.toLowerCase().replace(/[\s_()（）:：.-]+/g, " ").trim();

function columns(header: string[]) {
  const index = new Map(header.map((name, position) => [key(name), position]));
  return (...names: string[]) => {
    for (const name of names) { const position = index.get(key(name)); if (position !== undefined) return position; }
    return -1;
  };
}
const cell = (row: string[], position: number) => (position >= 0 ? row[position] ?? "" : "").trim();
const unknown = (value: string) => value === "\\N" || value === "N/A" ? "" : value;

const CABINS: [RegExp, string][] = [
  [/first|头等|頭等|^f$|^3$/i, "first"],
  [/business|商务|商務|公务|^c$|^j$|^2$/i, "business"],
  [/premium|超级经济|超級經濟|高端经济|^w$|^p$|^4$/i, "premium"],
  [/econ|经济|經濟|^y$|^1$/i, "economy"],
];
export const cabinOf = (value: string) => CABINS.find(([pattern]) => pattern.test(value.trim()))?.[1] ?? "";

// Flighty: Airline (ICAO or IATA) and Flight (number) in two columns, local
// date-times per airport, Canceled as true/false.
function flighty(table: Table, source: string): Candidate[] | null {
  const column = columns(table[0]);
  const airline = column("Airline"), flight = column("Flight"), from = column("From"), to = column("To");
  const takeoff = column("Take off (Scheduled)"), takeoffActual = column("Take off (Actual)");
  const gateOut = column("Gate Departure (Scheduled)"), gateOutActual = column("Gate Departure (Actual)");
  const gateIn = column("Gate Arrival (Scheduled)"), gateInActual = column("Gate Arrival (Actual)");
  const landing = column("Landing (Scheduled)"), landingActual = column("Landing (Actual)");
  if (airline < 0 || flight < 0 || from < 0 || to < 0 || (takeoff < 0 && gateOut < 0)) return null;
  const date = column("Date"), diverted = column("Diverted To");
  return table.slice(1).map((row) => {
    // Scheduled gate times, as a timetable and a ticket give them; actual ones when that is all there is.
    const out = [gateOut, takeoff, gateOutActual, takeoffActual].map((position) => cell(row, position)).find(Boolean) ?? "";
    const into = [gateIn, landing, gateInActual, landingActual].map((position) => cell(row, position)).find(Boolean) ?? "";
    const candidate = blank(source);
    candidate.date = dayOfDateTime(out) || parseDay(cell(row, date));
    candidate.airline = cell(row, airline);
    candidate.flight = `${cell(row, airline)}${cell(row, flight)}`;
    candidate.origin = cell(row, from);
    candidate.destination = cell(row, diverted) || cell(row, to);
    candidate.depart = parseClock(out);
    candidate.arrive = parseClock(into);
    candidate.arrivalDate = dayOfDateTime(into);
    candidate.seat = cell(row, column("Seat"));
    candidate.cabin = cabinOf(cell(row, column("Cabin Class")));
    candidate.aircraft = cell(row, column("Aircraft Type Name"));
    candidate.registration = cell(row, column("Tail Number"));
    candidate.status = /^true$/i.test(cell(row, column("Canceled"))) ? "cancelled" : "unknown";
    return candidate;
  });
}

// Flightradar24 (my.flightradar24.com): "Name / City (IATA/ICAO)" airports,
// "Name (IATA/ICAO)" airlines, 00:00:00 for a time nobody entered.
function flightradar(table: Table, source: string): Candidate[] | null {
  const column = columns(table[0]);
  const date = column("Date"), number = column("Flight number"), from = column("From"), to = column("To");
  if (date < 0 || number < 0 || from < 0 || to < 0 || column("Dep time") < 0) return null;
  const SEATS: Record<string, string> = { "1": "economy", "2": "business", "3": "first", "4": "premium" };
  return table.slice(1).map((row) => {
    const candidate = blank(source);
    const clock = (position: number) => { const value = cell(row, position); return value === "00:00:00" ? "" : parseClock(value); };
    candidate.date = parseDay(cell(row, date));
    candidate.flight = cell(row, number);
    candidate.airline = cell(row, column("Airline")).match(/\(([A-Z0-9]{2})\/?/)?.[1] ?? cell(row, column("Airline"));
    candidate.origin = cell(row, from);
    candidate.destination = cell(row, to);
    candidate.depart = clock(column("Dep time"));
    candidate.arrive = clock(column("Arr time"));
    candidate.seat = cell(row, column("Seat number"));
    candidate.cabin = SEATS[cell(row, column("Flight class"))] ?? cabinOf(cell(row, column("Flight class")));
    candidate.aircraft = cell(row, column("Aircraft"));
    candidate.registration = cell(row, column("Registration"));
    return candidate;
  });
}

// OpenFlights: \N or N/A for nothing, OIDs at the end.
function openflights(table: Table, source: string): Candidate[] | null {
  const column = columns(table[0]);
  const date = column("Date"), from = column("From"), to = column("To"), number = column("Flight Number");
  if (date < 0 || from < 0 || to < 0 || number < 0 || (column("From OID") < 0 && column("Distance") < 0)) return null;
  return table.slice(1).map((row) => {
    const candidate = blank(source);
    const value = (position: number) => unknown(cell(row, position));
    candidate.date = parseDay(value(date));
    candidate.depart = parseClock(value(date));
    candidate.flight = value(number);
    candidate.airline = value(column("Airline"));
    candidate.origin = value(from);
    candidate.destination = value(to);
    candidate.seat = value(column("Seat"));
    candidate.cabin = cabinOf(value(column("Class")));
    candidate.aircraft = value(column("Plane"));
    candidate.registration = value(column("Registration"));
    return candidate;
  });
}

// Any other table whose headers say plainly what each column is, in English
// or Chinese. Used only when nearly every row then reads cleanly; otherwise
// the model reads the table.
const HEADINGS = {
  date: ["date", "flight date", "departure date", "日期", "航班日期", "出发日期", "乘机日期", "起飞日期"],
  flight: ["flight", "flight number", "flight no", "flight #", "航班", "航班号", "航班號"],
  airline: ["airline", "carrier", "航空公司", "承运人", "航司"],
  origin: ["from", "origin", "departure", "departure airport", "dep", "出发", "出发地", "出发机场", "起飞机场", "始发", "出發"],
  destination: ["to", "destination", "arrival", "arrival airport", "arr", "到达", "目的地", "到达机场", "降落机场", "到達"],
  depart: ["departure time", "dep time", "std", "起飞时间", "出发时间", "計劃起飛", "计划起飞"],
  arrive: ["arrival time", "arr time", "sta", "到达时间", "降落时间", "计划到达"],
  seat: ["seat", "seat number", "座位", "座位号"],
  cabin: ["class", "cabin", "cabin class", "舱位", "舱等", "艙等"],
  aircraft: ["aircraft", "aircraft type", "plane", "equipment", "机型", "機型"],
  registration: ["registration", "tail", "tail number", "注册号", "注冊號", "机号"],
};

function headed(table: Table, source: string): Candidate[] | null {
  const column = columns(table[0]);
  const at = Object.fromEntries(Object.entries(HEADINGS).map(([field, names]) => [field, column(...names)])) as Record<keyof typeof HEADINGS, number>;
  if (at.date < 0 || at.origin < 0 || at.destination < 0) return null;
  const rows = table.slice(1);
  const order: DayOrder = dayOrderOf(rows.map((row) => cell(row, at.date)));
  const candidates = rows.map((row) => {
    const candidate = blank(source);
    candidate.date = parseDay(cell(row, at.date), order);
    candidate.flight = cell(row, at.flight);
    candidate.airline = cell(row, at.airline);
    candidate.origin = cell(row, at.origin);
    candidate.destination = cell(row, at.destination);
    candidate.depart = parseClock(cell(row, at.depart)) || parseClock(cell(row, at.date));
    candidate.arrive = parseClock(cell(row, at.arrive));
    candidate.arrivalDate = dayOfDateTime(cell(row, at.arrive));
    candidate.seat = cell(row, at.seat);
    candidate.cabin = cabinOf(cell(row, at.cabin));
    candidate.aircraft = cell(row, at.aircraft);
    candidate.registration = cell(row, at.registration);
    return candidate;
  });
  const clean = candidates.filter((candidate) => candidate.date && airportCode(candidate.origin) && airportCode(candidate.destination)).length;
  return clean >= Math.max(1, candidates.length * 0.9) ? candidates : null;
}

export function readTable(table: Table, source: string): { format: string; candidates: Candidate[] } | null {
  if (table.length < 2) return null;
  for (const [format, reader] of [["Flighty", flighty], ["Flightradar24", flightradar], ["OpenFlights", openflights], ["CSV", headed]] as const) {
    const candidates = reader(table, source);
    if (candidates) return { format, candidates: candidates.filter((candidate) => candidate.date || candidate.origin || candidate.flight) };
  }
  return null;
}

// Flyprint's own export (format "flyprint", or "waypoint" before the rename)
// and the archive format of earlier releases.
export function readJson(value: unknown, source: string): { format: string; candidates: Candidate[] } | null {
  const list = Array.isArray(value) ? value : (value as { flights?: unknown })?.flights;
  if (!Array.isArray(list) || !list.length) return null;
  const travellers = new Map(((value as { travellers?: { id: string; label: string }[] })?.travellers ?? []).map((traveller) => [traveller.id, traveller.label]));
  const candidates: Candidate[] = [];
  for (const item of list as Record<string, unknown>[]) {
    if (!item || typeof item !== "object" || typeof item.origin !== "string" || typeof item.destination !== "string" || typeof item.date !== "string") return null;
    const text = (name: string) => typeof item[name] === "string" ? (item[name] as string) : "";
    const candidate = blank(source);
    candidate.date = parseDay(text("date"));
    candidate.flight = text("flight");
    candidate.airline = text("airline");
    candidate.origin = text("origin");
    candidate.destination = text("destination");
    candidate.depart = parseClock(text("depart"));
    candidate.arrive = parseClock(text("arrive"));
    const offset = Number(item.arrivalDayOffset);
    if (candidate.date && Number.isFinite(offset) && offset !== 0) candidate.arrivalDate = new Date(Date.parse(`${candidate.date}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
    candidate.seat = text("seat");
    candidate.cabin = cabinOf(text("cabin"));
    const aircraft = item.aircraft as { model?: string; registration?: string } | undefined;
    candidate.aircraft = aircraft?.model ?? "";
    candidate.registration = aircraft?.registration ?? "";
    const ids = Array.isArray(item.travellerIds) ? item.travellerIds as string[] : typeof item.travellerId === "string" ? [item.travellerId] : [];
    candidate.passenger = ids.map((id) => travellers.get(id) ?? id).join(" · ");
    candidates.push(candidate);
  }
  return { format: "Flyprint", candidates };
}

// IATA Bar Coded Boarding Pass (Resolution 792), as in an Apple Wallet pass
// or a boarding pass's barcode text. The date is a day of the year without
// one, so the year is the one that puts the flight nearest the pass's own date.
const COMPARTMENTS: Record<string, string> = { F: "first", A: "first", P: "first", J: "business", C: "business", D: "business", I: "business", Z: "business", R: "business", W: "premium", E: "premium" };

export function readBoardingPass(message: string, source: string, around?: string): Candidate[] | null {
  const text = message.replace(/\r?\n/g, "");
  if (!/^M[1-4]/.test(text) || text.length < 58) return null;
  const legs = Number(text[1]);
  const passenger = text.slice(2, 22).trim().replace("/", " ");
  const reference = around && /^\d{4}-\d{2}-\d{2}/.test(around) ? around.slice(0, 10) : today();
  const candidates: Candidate[] = [];
  let at = 23;
  for (let leg = 0; leg < legs && at + 37 <= text.length; leg++) {
    const field = (offset: number, length: number) => text.slice(at + offset, at + offset + length).trim();
    const julian = Number(field(21, 3));
    const candidate = blank(source);
    candidate.origin = field(7, 3);
    candidate.destination = field(10, 3);
    const carrier = field(13, 3);
    candidate.airline = carrier;
    candidate.flight = `${carrier}${field(16, 5).replace(/^0+/, "")}`;
    if (julian >= 1 && julian <= 366) {
      const base = Number(reference.slice(0, 4));
      const options = [base - 1, base, base + 1].map((year) => new Date(Date.UTC(year, 0, julian)).toISOString().slice(0, 10));
      const distance = (date: string) => Math.abs(Date.parse(date) - Date.parse(reference));
      // With the pass's own date, the nearest year; without it, the latest one
      // already flown, since passes are logged after the flight.
      candidate.date = around
        ? options.sort((a, b) => distance(a) - distance(b))[0]
        : options.filter((date) => Date.parse(date) <= Date.parse(reference) + 2 * 86_400_000).pop() ?? options[0];
      candidate.sure = !!around;
    }
    candidate.cabin = COMPARTMENTS[field(24, 1)] ?? (field(24, 1) ? "economy" : "");
    candidate.seat = field(25, 4).replace(/^0+/, "");
    candidate.passenger = passenger;
    candidates.push(candidate);
    const conditional = parseInt(text.slice(at + 35, at + 37), 16);
    at += 37 + (Number.isFinite(conditional) ? conditional : 0);
  }
  return candidates.length ? candidates : null;
}

// Calendar files (TripIt, airline and mail apps): one event per flight, its
// summary naming the flight and both airports.
export function readCalendar(text: string, source: string): Candidate[] | null {
  if (!/BEGIN:VCALENDAR/i.test(text)) return null;
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const candidates: Candidate[] = [];
  for (const event of unfolded.split(/BEGIN:VEVENT/i).slice(1)) {
    const field = (name: string) => event.match(new RegExp(`^${name}(;[^:\\r\\n]*)?:(.*)$`, "im"));
    const summary = (field("SUMMARY")?.[2] ?? "").replace(/\\,/g, ",").replace(/\\n/gi, " ");
    const description = (field("DESCRIPTION")?.[2] ?? "").replace(/\\,/g, ",").replace(/\\n/gi, " ");
    const words = `${summary} ${field("LOCATION")?.[2] ?? ""} ${description}`;
    const number = words.match(/\b([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4})\b/);
    const route = words.match(/\b([A-Z]{3})\b\s*(?:to|→|->|–|-|—|至|到)\s*\b([A-Z]{3})\b/);
    if (!number || !route || !airport(route[1]) || !airport(route[2])) continue;
    const candidate = blank(source);
    candidate.flight = `${number[1]}${number[2]}`;
    candidate.origin = route[1];
    candidate.destination = route[2];
    const moment = (name: string, code: string) => {
      const match = field(name);
      const value = match?.[2]?.trim() ?? "";
      const parts = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{0,2}(Z?))?$/);
      if (!parts) return { date: "", time: "" };
      const [, year, month, date, hour, minute, utc] = parts;
      if (!hour) return { date: `${year}-${month}-${date}`, time: "" };
      // A UTC time becomes the airport's own clock.
      if (utc || !match?.[1]?.includes("TZID")) {
        const tz = airport(code)?.tz;
        if (utc && tz) {
          const local = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Date.UTC(+year, +month - 1, +date, +hour, +minute)));
          return { date: local.slice(0, 10), time: local.slice(11, 16) };
        }
      }
      return { date: `${year}-${month}-${date}`, time: `${hour}:${minute}` };
    };
    const start = moment("DTSTART", candidate.origin), end = moment("DTEND", candidate.destination);
    candidate.date = start.date;
    candidate.depart = start.time;
    candidate.arrive = end.time;
    candidate.arrivalDate = end.date;
    candidates.push(candidate);
  }
  return candidates.length ? candidates : null;
}

