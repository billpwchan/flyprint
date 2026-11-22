import carrierMarks from "./carrier-marks.json";
import type { LngLat } from "./geo";

// One person's archive: every flight on their pages is one they logged.
// tone indexes palette.tones; label is the short mark they go by.
export type Person = { id: string; name: string; label: string; tone: number };
// What one side of a link lets the other see: the flights both logged, or
// every route as well.
export type Sharing = "together" | "all";
// Someone the reader linked with: how many flights both logged and what each
// side shares. Their tone is already moved off the reader's own.
export type Link = Person & { together: number; mine: Sharing; theirs: Sharing };
// Where a flight sits on a page about two people.
export type Side = "me" | "both" | "them";
export type Aircraft = { model:string; icao:string; registration?:string; source:"operated"|"scheduled"|"typical"; body:"widebody"|"narrowbody" };
export type FlightOperation = { airline:string; flight:string; source:"operated"|"scheduled" };
export type TimeSource = "recorded" | "historical_schedule" | "estimated";
// `airline` is the carrier's IATA code (or ICAO when it has none). Times are
// local "HH:MM", empty when the source did not say; duration is then estimated.
// `with`: the links who logged the same flight. `side`: set only on a page about two people.
// `departAt`: the take-off instant (ms since the epoch), when the departure time is known.
// `arriveAt`: the landing instant, set only on flights still ahead or landed in
// the last few days; a flight without it landed long ago.
export type Flight = { id: string; date: string; year: number; airline: string; flight: string; origin: string; destination: string; depart: string; arrive: string; arrivalDayOffset: number; durationMinutes: number; timeSource: TimeSource; km: number; departAt?: number; arriveAt?: number; aircraft?:Aircraft; operation?:FlightOperation; seat?: string; cabin?: string; with?: string[]; side?: Side };

// Names in the three interface languages: Simplified, Traditional, English.
export type Names = [hans: string, hant: string, en: string];
export type Place = { city: Names; name: Names; country: string; coordinates: LngLat };

// Everything one reader's pages draw from: their own flights, the people they
// linked with, and names and positions for every code those flights use.
export type Atlas = { places: Record<string, Place>; carriers: Record<string, Names>; countries: Record<string, Names> };
// `asOf`: the instant the server read it, so the first render on both sides
// agrees on which flights are still ahead.
export type Archive = Atlas & { owner: Person; links: Link[]; flights: Flight[]; asOf: number };

// invites: link invitations waiting for this reader's answer.
// trial: days left before an unkept trial account is deleted; null for an account.
export type Viewer = { id: string; name: string; email: string; label: string; invites: number; trial: number | null };

// The page two linked people share: the flights both logged, and each one's
// own routes when both chose to share them.
export type Pair = { other: Link; flights: Flight[]; overlay: boolean; atlas: Atlas; demo: boolean };

// Ties in a ranking break by code point: localeCompare collates Chinese
// differently on the server and in the browser, and the first render must match.
export const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Airlines with a mark in public/airlines (scripts/build-airlines.mjs).
export const carrierAssets = new Set<string>(carrierMarks);
