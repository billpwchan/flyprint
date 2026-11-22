"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { parseYear } from "../../lib/scope";

// Filters that belong in the address (the year, a search) but should change
// without a server round trip. The page renders from the value the server
// read; afterwards the address is the record, and the router is not asked.
// The router's own search params stop following the address once it has
// been rewritten in place, so the address is read directly.

const read = (name: string) => new URLSearchParams(window.location.search).get(name) ?? "";
const ADDRESS_CHANGED = "flyprint:address";

export function writeParam(name: string, value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value); else url.searchParams.delete(name);
  const next = `${url.pathname}${url.search}`;
  if (next === `${window.location.pathname}${window.location.search}`) return;
  window.history.replaceState(window.history.state, "", next);
  window.dispatchEvent(new Event(ADDRESS_CHANGED));
}

function subscribeAddress(listener: () => void) {
  const api = (window as unknown as { navigation?: EventTarget }).navigation;
  // The router rewrites the address inside a React commit; read it after.
  const later = () => queueMicrotask(listener);
  api?.addEventListener("currententrychange", later);
  window.addEventListener("popstate", later);
  window.addEventListener(ADDRESS_CHANGED, listener);
  return () => {
    api?.removeEventListener("currententrychange", later);
    window.removeEventListener("popstate", later);
    window.removeEventListener(ADDRESS_CHANGED, listener);
  };
}

// A parameter of this page's address. The server renders from the value it
// read; on the client the address itself is the record. While the reader is
// elsewhere, the page keeps the last value it had.
export function useAddressParam(name: string, path: string, serverValue: string) {
  const last = useRef(serverValue);
  const value = useSyncExternalStore(
    subscribeAddress,
    () => {
      if (window.location.pathname === path) last.current = read(name);
      return last.current;
    },
    () => serverValue,
  );
  // Without the Navigation API a router push to this page announces nothing,
  // and it rewrites the address only after rendering; look once it has.
  useEffect(() => {
    if (window.location.pathname === path && read(name) !== value) window.dispatchEvent(new Event(ADDRESS_CHANGED));
  });
  const set = useCallback((next: string) => writeParam(name, next), [name]);
  return [value, set] as const;
}

// The year being browsed, shared with the section tabs so moving between
// sections keeps it. Pages publish it; the server snapshot has none.
let browsedYear: number | null = null;
const listeners = new Set<() => void>();

export function publishYear(year: number | null) {
  if (browsedYear === year) return;
  browsedYear = year;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function useBrowsedYear() {
  return useSyncExternalStore(subscribe, () => browsedYear, () => null);
}


// The year filter of a section page: from the server first, then the address.
export function useYearParam(path: string, serverYear: number | null) {
  const [raw, setRaw] = useAddressParam("year", path, serverYear ? String(serverYear) : "");
  const year = parseYear(raw);
  useEffect(() => { publishYear(year); }, [year]);
  const setYear = useCallback((next: number | null) => setRaw(next ? String(next) : ""), [setRaw]);
  return [year, setYear] as const;
}
