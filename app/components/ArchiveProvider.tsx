"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { registerAtlas } from "../lib/atlas";
import type { Archive, Flight, Viewer } from "../lib/data";
import { dayIn, splitFlights, type Clock } from "../lib/plan";

// `flights` are the ones flown: every count, map and list of the past reads
// them. `ahead` are booked or in the air, soonest first; `all` is both.
// `landedBy`: the instant the split was taken, for splitting other lists alike.
type Reader = Archive & { ahead: Flight[]; all: Flight[]; landedBy: number };
// shared: the archive is someone's public page, not the reader's own.
export type Shared = { slug: string; mine: boolean };
type Value = { archive: Reader; viewer: Viewer | null; zone: string | null; shared: Shared | null };

const ArchiveContext = createContext<Value | null>(null);

// The reader's flights (or the sample, signed out) and who they are. The
// layout reads them once per page load; client navigations keep them. A
// flight moves from ahead to flown when it lands, without a reload.
export default function ArchiveProvider({ archive, viewer, zone, shared = null, children }: { archive: Archive; viewer: Viewer | null; zone: string | null; shared?: Shared | null; children: React.ReactNode }) {
  registerAtlas(archive);
  const now = useLandedBy(archive.flights, archive.asOf);
  useEffect(() => {
    const own = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // The cookie keeps its name from before the rename; request.ts reads it.
    if (own && own !== zone) document.cookie = `waypoint-zone=${encodeURIComponent(own)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [zone]);
  const value = useMemo(() => {
    const { landed, ahead } = splitFlights(archive.flights, now);
    return { archive: { ...archive, flights: landed, ahead, all: archive.flights, landedBy: now }, viewer, zone, shared };
  }, [archive, viewer, zone, now, shared]);
  return <ArchiveContext.Provider value={value}>{children}</ArchiveContext.Provider>;
}

// The instant a list of flights is split at into landed and ahead. It moves on
// only when one of them lands, so whatever is built from the split is not
// rebuilt every minute; it starts at the server's instant and never goes back
// before it, even on a clock running behind.
export function useLandedBy(flights: Flight[], asOf: number) {
  const [now, setNow] = useState(asOf);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ahead = (instant: number) => flights.filter((flight) => flight.arriveAt !== undefined && flight.arriveAt > instant).length;
    const step = () => {
      clearTimeout(timer);
      const current = Math.max(Date.now(), asOf);
      setNow((previous) => ahead(previous) === ahead(current) ? previous : current);
      const next = Math.min(...flights.map((flight) => flight.arriveAt ?? 0).filter((at) => at > current));
      if (Number.isFinite(next)) timer = setTimeout(step, Math.min(next - current + 1000, 6 * 3_600_000));
    };
    step();
    // A sleeping tab's timers run late; waking up checks again.
    document.addEventListener("visibilitychange", step);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", step); };
  }, [flights, asOf]);
  return now;
}

function useValue() {
  const value = useContext(ArchiveContext);
  if (!value) throw new Error("useArchive must be used within ArchiveProvider");
  return value;
}

export const useArchive = () => useValue().archive;
export const useViewer = () => useValue().viewer;
export const useShared = () => useValue().shared;

// The people the reader linked with, by id.
export function useLinks() {
  const { links } = useArchive();
  return useMemo(() => new Map(links.map((link) => [link.id, link])), [links]);
}

// The time to the minute, for countdowns. The first render uses the instant
// the server read the archive and the day in the reader's last known zone, so
// both sides draw the same words; the browser's own clock takes over after.
const listeners = new Set<() => void>();
let ticking: ReturnType<typeof setInterval> | undefined;
let clientClock: Clock | null = null;
const MINUTE = 60_000;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!ticking) {
    ticking = setInterval(() => { for (const run of listeners) run(); }, 15_000);
    document.addEventListener("visibilitychange", notify);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { clearInterval(ticking); ticking = undefined; document.removeEventListener("visibilitychange", notify); }
  };
}
function notify() { for (const run of listeners) run(); }

function readClock(): Clock {
  const now = Math.floor(Date.now() / MINUTE) * MINUTE;
  if (clientClock?.now !== now) clientClock = { now, today: dayIn(now) };
  return clientClock;
}

const serverClocks = new Map<string, Clock>();
function serverClock(asOf: number, zone: string | null): Clock {
  const key = `${asOf}|${zone ?? ""}`;
  let clock = serverClocks.get(key);
  if (!clock) {
    const now = Math.floor(asOf / MINUTE) * MINUTE;
    clock = { now, today: dayIn(now, zone ?? "UTC") };
    if (serverClocks.size > 50) serverClocks.clear();
    serverClocks.set(key, clock);
  }
  return clock;
}

export function useClock(): Clock {
  const { archive, zone } = useValue();
  return useSyncExternalStore(subscribe, readClock, () => serverClock(archive.asOf, zone));
}
