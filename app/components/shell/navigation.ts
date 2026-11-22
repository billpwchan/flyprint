"use client";

import { useSyncExternalStore } from "react";

// The in-app history, so a back link can name the screen it returns to and
// the panel can return to where the reader was on that screen.
let stack: string[] = [];
// The back or forward in progress: where it lands, and when it began.
let traversal: { path: string; at: number } | null = null;
// Set in the same commit that swaps the screen, so the scroll event the swap
// itself causes is booked to the new screen, never to the one just left.
let current = "";
// The next arrival takes the place of the screen in view (a neighbour, another
// city picked on the map) instead of stacking on it, as the browser's history did.
let swapping = false;
const positions = new Map<string, number>();
const listeners = new Set<() => void>();

// A back or forward can swap the screen before popstate reaches any listener.
// The Navigation API's navigate event comes earlier still, and it also reports
// every ordinary navigation, which clears a traversal that never changed the
// path (going back from /log?q=a to /log). Without the API, popstate is the
// only signal, heard in the capture phase ahead of the router's own listener.
type NavigateEvent = Event & { navigationType?: string; destination?: { url: string } };
if (typeof window !== "undefined") {
  const api = (window as unknown as { navigation?: EventTarget }).navigation;
  const land = (url: string) => { traversal = { path: new URL(url, window.location.href).pathname, at: performance.now() }; };
  if (api) {
    api.addEventListener("navigate", (event) => {
      const { navigationType, destination } = event as NavigateEvent;
      if (navigationType === "traverse" && destination) land(destination.url);
      else traversal = null;
    }, { capture: true });
  } else {
    window.addEventListener("popstate", () => land(window.location.href), { capture: true });
  }
}

// Returns whether the arrival came from the browser's back or forward.
export function arrive(path: string) {
  current = path;
  const wasPop = traversal?.path === path && performance.now() - traversal.at < 8000;
  traversal = null;
  const swap = swapping;
  swapping = false;
  if (stack.at(-1) === path) return wasPop;
  const index = stack.lastIndexOf(path);
  if (wasPop && index >= 0) stack = stack.slice(0, index + 1);
  else if (swap && stack.length) stack = [...stack.slice(0, -1), path];
  else stack = [...stack, path];
  listeners.forEach((listener) => listener());
  return wasPop;
}

// Call right before a router.replace or a <Link replace> that moves sideways.
export function swap() { swapping = true; }

export const rememberScroll = (top: number) => { if (current) positions.set(current, top); };
export const scrollFor = (path: string) => positions.get(path) ?? 0;

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const previous = () => stack.at(-2) ?? null;
export const usePreviousPath = () => useSyncExternalStore(subscribe, previous, () => null);
