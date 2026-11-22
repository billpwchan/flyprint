import { cache } from "react";
import demoSource from "../../data/flights.example.json";
import { registerAtlas } from "../atlas";
import type { Aircraft, Archive, Flight, FlightOperation, Link, Pair, Person, TimeSource, Viewer } from "../data";
import { toneBeside } from "../palette";
import { atlasFor } from "./gazetteer";
import { departureOf, landingOf } from "./landing";
import { legacyRecord, sameFlight, travellersOf, type FlightRecord, type LegacyArchive } from "./records";
import "./seed";
import { currentUser, guestDaysLeft, type User } from "./auth";
import { database } from "./db";
import { linkBetween, linksOf, waitingFor, type Linked } from "./links";

type Row = {
  id: string; date: string; flight: string; airline: string; origin: string; destination: string; depart: string; arrive: string;
  arrival_day_offset: number; duration_minutes: number; time_source: string; km: number; seat: string; cabin: string;
  aircraft: string | null; operation: string | null;
};

const parse = <T,>(value: string | null): T | undefined => { if (!value) return undefined; try { return JSON.parse(value) as T; } catch { return undefined; } };

export function recordsOf(userId: string): FlightRecord[] {
  const rows = database().prepare("SELECT id, date, flight, airline, origin, destination, depart, arrive, arrival_day_offset, duration_minutes, time_source, km, seat, cabin, aircraft, operation FROM flights WHERE user_id = ?").all(userId) as Row[];
  return rows.map((row) => ({
    id: row.id, date: row.date, flight: row.flight, airline: row.airline, origin: row.origin, destination: row.destination,
    depart: row.depart, arrive: row.arrive, arrivalDayOffset: row.arrival_day_offset, durationMinutes: row.duration_minutes,
    timeSource: row.time_source as TimeSource, km: row.km, seat: row.seat, cabin: row.cabin,
    aircraft: parse<Aircraft>(row.aircraft), operation: parse<FlightOperation>(row.operation),
  }));
}

// Which of one person's flights the other also logged, by the rule imports use
// to recognise a flight already logged. Each flight pairs at most once, and
// flights with the same number pair first, so one logged without a number
// cannot take the partner of a numbered one.
export function sharedFlights(mine: FlightRecord[], theirs: FlightRecord[]): Map<string, string> {
  const byDay = new Map<string, FlightRecord[]>();
  for (const record of theirs) {
    const day = byDay.get(record.date);
    if (day) day.push(record); else byDay.set(record.date, [record]);
  }
  const pairs = new Map<string, string>();
  const taken = new Set<string>();
  for (const numbered of [true, false]) {
    for (const record of mine) {
      if (pairs.has(record.id)) continue;
      const match = byDay.get(record.date)?.find((other) => !taken.has(other.id) && sameFlight(record, other) && (!numbered || (!!record.flight && record.flight === other.flight)));
      if (match) { pairs.set(record.id, match.id); taken.add(match.id); }
    }
  }
  return pairs;
}

// Only flights near now carry their landing time; the rest have long landed.
const RECENT = 3 * 86_400_000;

const toFlight = (record: FlightRecord, asOf: number, extra: Partial<Flight> = {}): Flight => {
  const departAt = departureOf(record);
  const arriveAt = landingOf(record, departAt);
  const flight: Flight = { ...record, year: Number(record.date.slice(0, 4)), departAt, arriveAt: arriveAt > asOf - RECENT ? arriveAt : undefined, ...extra };
  if (flight.departAt === undefined) delete flight.departAt;
  if (flight.arriveAt === undefined) delete flight.arriveAt;
  if (!record.seat) delete flight.seat;
  if (!record.cabin) delete flight.cabin;
  if (!flight.with?.length) delete flight.with;
  return flight;
};

// Another person's flight on a shared page: where and when, nothing of their ticket.
const theirFlight = (record: FlightRecord, asOf: number): Flight => {
  const { departAt, arriveAt } = toFlight(record, asOf);
  const flight: Flight = {
    id: `them:${record.id}`, date: record.date, year: Number(record.date.slice(0, 4)), airline: record.airline, flight: record.flight,
    origin: record.origin, destination: record.destination, depart: record.depart, arrive: record.arrive, arrivalDayOffset: record.arrivalDayOffset,
    durationMinutes: record.durationMinutes, timeSource: record.timeSource, km: record.km, departAt, arriveAt, side: "them",
  };
  if (departAt === undefined) delete flight.departAt;
  if (arriveAt === undefined) delete flight.arriveAt;
  return flight;
};

// Flights both logged count as flown together once they have landed.
const landedPairs = (pairs: Map<string, string>, flights: Flight[], asOf: number) => {
  const ahead = new Set(flights.filter((flight) => (flight.arriveAt ?? 0) > asOf).map((flight) => flight.id));
  return [...pairs.keys()].filter((id) => !ahead.has(id)).length;
};

const newestFirst = (a: Flight, b: Flight) => b.date.localeCompare(a.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function withAtlas<T extends { flights: Flight[] }>(value: T) {
  const archive = { ...value, ...atlasFor(value.flights) };
  registerAtlas(archive);
  return archive;
}

const personOf = (user: Pick<User, "id" | "name" | "label" | "tone">): Person => ({ id: user.id, name: user.name, label: user.label, tone: user.tone });

function linkOf(owner: Person, linked: Linked, together: number): Link {
  return { id: linked.id, name: linked.name, label: linked.label, tone: toneBeside(owner.tone, linked.tone), together, mine: linked.mine, theirs: linked.theirs };
}

// The reader's own flights, each marked with the links who logged it too.
function archiveFor(owner: Person, mine: FlightRecord[], links: { linked: Linked; records: FlightRecord[] }[], asOf: number): Archive {
  const marks = new Map<string, string[]>();
  const paired = links.map(({ linked, records }) => {
    const pairs = sharedFlights(mine, records);
    for (const id of pairs.keys()) marks.set(id, [...(marks.get(id) ?? []), linked.id]);
    return { linked, pairs };
  });
  const flights = mine.map((record) => toFlight(record, asOf, { with: marks.get(record.id) })).sort(newestFirst);
  const summaries = paired.map(({ linked, pairs }) => linkOf(owner, linked, landedPairs(pairs, flights, asOf)));
  return withAtlas({ owner, links: summaries, flights, asOf });
}

// Two people's page: the flights both logged (as the reader's copies), and,
// when both share everything, each one's other routes.
function pairFor(owner: Person, mine: FlightRecord[], linked: Linked, theirs: FlightRecord[], demo: boolean, asOf: number): Pair {
  const pairs = sharedFlights(mine, theirs);
  const matched = new Set(pairs.values());
  const overlay = linked.mine === "all" && linked.theirs === "all";
  const flights = [
    ...mine.filter((record) => pairs.has(record.id)).map((record) => toFlight(record, asOf, { side: "both" })),
    ...(overlay ? mine.filter((record) => !pairs.has(record.id)).map((record) => toFlight(record, asOf, { side: "me" })) : []),
    ...(overlay ? theirs.filter((record) => !matched.has(record.id)).map((record) => theirFlight(record, asOf)) : []),
  ].sort(newestFirst);
  const { places, carriers, countries } = withAtlas({ flights });
  return { other: linkOf(owner, linked, landedPairs(pairs, flights, asOf)), flights, overlay, atlas: { places, carriers, countries }, demo };
}

// The sample: one traveller's flights, linked with a second sample traveller.
// Its dates slide forward by whole weeks (weekdays stay true) so that the
// archive's own "today" is always this week and its booked flights stay ahead.
export const DEMO_LINK = "sample";
type Sample = { owner: Person; mine: FlightRecord[]; linked: Linked; theirs: FlightRecord[]; archive: Archive };
let demo: { week: number; sample: Sample } | null = null;
const WEEK = 7 * 86_400_000;
function demoSet(): Sample {
  const source = demoSource as unknown as LegacyArchive & { anchor?: string };
  const anchor = Date.parse(`${source.anchor ?? "2026-11-19"}T00:00:00Z`);
  const week = Math.max(0, Math.floor((Date.now() - anchor) / WEEK));
  if (demo && demo.week === week) { registerAtlas(demo.sample.archive); return demo.sample; }
  const shift = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + week * WEEK).toISOString().slice(0, 10);
  const label = (id: string) => source.travellers?.find((traveller) => traveller.id === id)?.label ?? id;
  const of = (id: string) => source.flights.filter((flight) => travellersOf(flight).includes(id))
    .map((flight) => legacyRecord(week ? { ...flight, date: shift(flight.date) } : flight));
  const owner: Person = { id: "sample-owner", name: label("B"), label: label("B"), tone: 0 };
  const linked: Linked = { id: DEMO_LINK, name: label("Z"), label: label("Z"), email: "", tone: 1, mine: "all", theirs: "all" };
  const mine = of("B"), theirs = of("Z");
  const sample = { owner, mine, linked, theirs, archive: archiveFor(owner, mine, [{ linked, records: theirs }], Date.now()) };
  demo = { week, sample };
  return sample;
}
export const demoArchive = (): Archive => ({ ...demoSet().archive, asOf: Date.now() });

// Someone's public page: the flights they have flown, without seats, cabins,
// the people they flew with or anything still ahead of them. A flight shows
// only once it landed days ago (only those carry no landing instant), and
// without its instants or airframe, so the page never says where its owner
// is right now.
export function sharedArchive(slug: string): Archive | null {
  if (!/^[a-z0-9]{8,24}$/.test(slug)) return null;
  const owner = database().prepare("SELECT id, name, label, tone FROM users WHERE share = ?").get(slug) as Pick<User, "id" | "name" | "label" | "tone"> | undefined;
  if (!owner) return null;
  const asOf = Date.now();
  const flights = recordsOf(owner.id)
    .map((record) => toFlight({ ...record, id: `s:${record.id}`, seat: "", cabin: "", operation: undefined }, asOf))
    .filter((flight) => flight.arriveAt === undefined)
    .map((flight): Flight => {
      const open: Flight = { ...flight };
      delete open.departAt;
      if (flight.aircraft) {
        open.aircraft = { ...flight.aircraft };
        delete open.aircraft.registration;
      }
      return open;
    })
    .sort(newestFirst);
  return withAtlas({ owner: personOf(owner), links: [], flights, asOf });
}
export const loadShared = cache(async (slug: string) => sharedArchive(slug));

export function userArchive(user: User): Archive {
  return archiveFor(personOf(user), recordsOf(user.id), linksOf(user.id).map((linked) => ({ linked, records: recordsOf(linked.id) })), Date.now());
}

export function pairOf(user: User | null, otherId: string): Pair | null {
  if (!user) {
    if (otherId !== DEMO_LINK) return null;
    const sample = demoSet();
    return pairFor(sample.owner, sample.mine, sample.linked, sample.theirs, true, Date.now());
  }
  const linked = linkBetween(user.id, otherId);
  return linked ? pairFor(personOf(user), recordsOf(user.id), linked, recordsOf(linked.id), false, Date.now()) : null;
}

export function viewerOf(user: User): Viewer {
  return { id: user.id, name: user.name, email: user.email, label: user.label, invites: waitingFor(user.id), trial: user.guest ? guestDaysLeft(user) : null };
}

// What this request renders: the signed-in reader's archive, or the sample.
export const loadSession = cache(async () => {
  // Opening the database also applies a waiting first-run seed.
  database();
  const user = await currentUser();
  return user ? { user, viewer: viewerOf(user), archive: userArchive(user) } : { user: null, viewer: null, archive: demoArchive() };
});

// The page two people share, for this request's reader.
export const loadPair = cache(async (otherId: string) => pairOf((await loadSession()).user, otherId));
