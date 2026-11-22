import Anthropic from "@anthropic-ai/sdk";
import { database, now } from "../db";
import { blank, type Candidate } from "./types";

// The model reads what no fixed reader can: screenshots (航旅纵横, airline
// apps, Flighty), PDFs and OFD itineraries, mail, and tables of any layout.
// It also names places and airlines in the three interface languages.

const READER = "claude-opus-5-5";
const NAMER = "claude-sonnet-5-5";
const DAILY_PER_USER = 60;
const DAILY_TOTAL = 600;
// Trials share part of the day's calls, so readers with accounts always have
// the rest; a trial that runs out is told signing up lets it go on.
const DAILY_PER_TRIAL = 20;
const DAILY_TRIALS = 300;

let client: Anthropic | null = null;
export const modelAvailable = () => !!process.env.ANTHROPIC_API_KEY;
const anthropic = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 5 * 60_000 }));

export class QuotaError extends Error {}

// Model calls per reader per day, and for the whole site, so one account
// cannot spend the key.
function spend(userId: string) {
  const db = database();
  const day = new Date(now()).toISOString().slice(0, 10);
  const used = (scope: string) => (db.prepare("SELECT calls FROM usage WHERE scope = ? AND day = ?").get(scope, day) as { calls: number } | undefined)?.calls ?? 0;
  const account = db.prepare("SELECT guest FROM users WHERE id = ?").get(userId) as { guest: number } | undefined;
  // A trial ended or swept mid-import stops reading: nobody is left to read for,
  // and its calls must not slip out of the trials' share.
  if (!account) throw new QuotaError("interrupted");
  const trial = !!account.guest;
  if (used("all") >= DAILY_TOTAL) throw new QuotaError("quota");
  if (trial && (used(`user:${userId}`) >= DAILY_PER_TRIAL || used("trials") >= DAILY_TRIALS)) throw new QuotaError("trial_quota");
  if (used(`user:${userId}`) >= DAILY_PER_USER) throw new QuotaError("quota");
  const add = db.prepare("INSERT INTO usage (scope, day, calls) VALUES (?, ?, 1) ON CONFLICT (scope, day) DO UPDATE SET calls = calls + 1");
  add.run(`user:${userId}`, day);
  add.run("all", day);
  if (trial) add.run("trials", day);
}

const READ_SYSTEM = `You turn travel records into a list of flights for a personal flight log.

The input may be screenshots of airline or travel apps (航旅纵横/Umetrip, Flighty, airline apps, booking sites), boarding passes, e-tickets, itineraries (行程单, including OFD and PDF), booking emails, or rows of a spreadsheet whose columns may be in Chinese or English. Screenshots of one long page may overlap; list a flight once.

List every flight segment shown. A trip with a connection is two segments. Ignore trains, hotels, adverts and anything that is not a flight.

For each segment:
- date: local departure date, YYYY-MM-DD. If the year is not printed, infer it from the surrounding context (other dates, the order of a list, "今年"); if you still cannot be sure, give your best year and set sure to false.
- flight: marketing carrier's IATA designator and number with no space and no leading zeros, e.g. CA1501, CX255, 3U8888. If only a number is shown, prefix the carrier's IATA code.
- airline: the marketing carrier's two-character IATA code.
- origin, destination: IATA airport codes. Documents often name only a city or an airport in Chinese; use the code of that airport (首都 PEK, 大兴 PKX, 浦东 PVG, 虹桥 SHA, 白云 CAN, 宝安 SZX, 双流 CTU, 天府 TFU, 赤鹿角/香港 HKG, 桃园 TPE, 松山 TSA, 成田 NRT, 羽田 HND, 关西 KIX, 仁川 ICN, 金浦 GMP, 希斯罗 LHR, 盖特威克 LGW). If a city has several airports and nothing says which, give its main airport and set sure to false. originName and destinationName: the place as the document writes it.
- depart, arrive: local 24-hour times HH:MM as printed (actual if both are shown, else scheduled). arrivalDate: the arrival date when it differs from the departure date (a "+1" mark means the next day), else "".
- seat (e.g. 32K), cabin (economy, premium, business or first; 经济舱 economy, 超级经济舱 premium, 公务舱/商务舱 business, 头等舱 first), aircraft (type in English, e.g. "Airbus A330-300", "Boeing 787-9"), registration (e.g. G-XWBA), passenger (name as printed).
- status: flown (已使用, 已出行, 已到达, landed), cancelled (已取消, 已退票, refunded, cancelled), upcoming (not yet flown), or unknown.
- sure: false when any field above is a guess.

Use "" for anything the input does not show. Never invent a flight, a time or a seat. If there are no flights, return an empty list.`;

const FIELD = { type: "string" } as const;
const READ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["flights"],
  properties: {
    flights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "flight", "airline", "origin", "originName", "destination", "destinationName", "depart", "arrive", "arrivalDate", "seat", "cabin", "aircraft", "registration", "passenger", "status", "sure"],
        properties: {
          date: FIELD, flight: FIELD, airline: FIELD, origin: FIELD, originName: FIELD, destination: FIELD, destinationName: FIELD,
          depart: FIELD, arrive: FIELD, arrivalDate: FIELD, seat: FIELD,
          cabin: { type: "string", enum: ["economy", "premium", "business", "first", ""] },
          aircraft: FIELD, registration: FIELD, passenger: FIELD,
          status: { type: "string", enum: ["flown", "upcoming", "cancelled", "unknown"] },
          sure: { type: "boolean" },
        },
      },
    },
  },
};

type ReadFlight = Omit<Candidate, "source"> & { originName: string; destinationName: string };

export type Part =
  | { kind: "image"; media: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: Buffer }
  | { kind: "pdf"; data: Buffer }
  | { kind: "text"; text: string };

async function ask<T>(userId: string, params: { model: string; system: string; schema: object; content: Anthropic.Beta.BetaContentBlockParam[]; effort: "low" | "medium"; maxTokens: number }): Promise<T> {
  spend(userId);
  const stream = anthropic().beta.messages.stream({
    model: params.model,
    max_tokens: params.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
    output_config: { effort: params.effort, format: { type: "json_schema", schema: params.schema } },
    messages: [{ role: "user", content: params.content }],
  } as Anthropic.Beta.MessageCreateParamsStreaming);
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new Error("refused");
  if (message.stop_reason === "max_tokens") throw new Error("too_long");
  const text = message.content.map((block) => block.type === "text" ? block.text : "").join("");
  return JSON.parse(text) as T;
}

export async function readFlights(userId: string, parts: Part[], label: string): Promise<Candidate[]> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = parts.map((part) => {
    if (part.kind === "image") return { type: "image", source: { type: "base64", media_type: part.media, data: part.data.toString("base64") } };
    if (part.kind === "pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data: part.data.toString("base64") } };
    return { type: "text", text: part.text };
  });
  content.push({ type: "text", text: "List the flights in the input above." });
  const visual = parts.some((part) => part.kind !== "text");
  const result = await ask<{ flights: ReadFlight[] }>(userId, { model: READER, system: READ_SYSTEM, schema: READ_SCHEMA, content, effort: visual ? "medium" : "low", maxTokens: 32_000 });
  return result.flights.map((flight) => {
    const candidate = blank(label);
    for (const field of Object.keys(candidate) as (keyof Candidate)[]) {
      if (field === "source") continue;
      const value = flight[field as keyof ReadFlight];
      if (value !== undefined) (candidate as Record<string, unknown>)[field] = value;
    }
    candidate.origin = flight.origin || flight.originName;
    candidate.destination = flight.destination || flight.destinationName;
    return candidate;
  });
}

const NAME_SYSTEM = `You give the names a bilingual flight log shows for airports and airlines, in Simplified Chinese, Traditional Chinese (as used in Hong Kong and Taiwan) and English.

For airports: city is the city the airport serves as travellers call it (e.g. 东京/東京/Tokyo for NRT and HND; 香港/香港/Hong Kong); name is the airport's own short name without the city when the city is obvious (e.g. 成田/成田/Narita, 浦东/浦東/Pudong, 希斯罗/希斯路/Heathrow). Use the established Chinese names where they exist; for a small airport with none, transliterate as Chinese media do.

For airlines: the carrier's usual name (中国国际航空/中國國際航空/Air China, 国泰航空/國泰航空/Cathay Pacific). When an airline is given by its three-letter ICAO designator, also give its two-character IATA code in iata (or "" if it has none); for an IATA code, repeat it in iata.`;

const NAMES = { type: "array", items: FIELD } as const;
const NAME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["airports", "airlines"],
  properties: {
    airports: { type: "array", items: { type: "object", additionalProperties: false, required: ["code", "city", "name"], properties: { code: FIELD, city: NAMES, name: NAMES } } },
    airlines: { type: "array", items: { type: "object", additionalProperties: false, required: ["code", "iata", "names"], properties: { code: FIELD, iata: FIELD, names: NAMES } } },
  },
};

export type Named = {
  airports: { code: string; city: [string, string, string]; name: [string, string, string] }[];
  airlines: { code: string; iata: string; names: [string, string, string] }[];
};

export async function nameThings(userId: string, airports: { code: string; city: string; name: string; country: string }[], airlines: string[]): Promise<Named> {
  const lines = [
    airports.length ? `Airports (IATA code, English city, English name, country):\n${airports.map((item) => `${item.code}\t${item.city}\t${item.name}\t${item.country}`).join("\n")}` : "",
    airlines.length ? `Airlines (IATA or ICAO code):\n${airlines.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  const result = await ask<Named>(userId, { model: NAMER, system: NAME_SYSTEM, schema: NAME_SCHEMA, content: [{ type: "text", text: `${lines}\n\nGive each its names as [Simplified, Traditional, English].` }], effort: "low", maxTokens: 8000 });
  const triple = (value: string[]) => value.length === 3 && value.every((item) => typeof item === "string" && item.trim()) ? value.map((item) => item.trim()) as [string, string, string] : null;
  return {
    airports: result.airports.flatMap((item) => { const city = triple(item.city), name = triple(item.name); return city && name ? [{ code: item.code, city, name }] : []; }),
    airlines: result.airlines.flatMap((item) => { const names = triple(item.names); return names ? [{ code: item.code, iata: item.iata, names }] : []; }),
  };
}
