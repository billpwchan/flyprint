import type { TimeSource } from "../../data";

// A flight as a source states it, before codes are checked and times worked out.
export type Candidate = {
  date: string; flight: string; airline: string; origin: string; destination: string;
  depart: string; arrive: string; arrivalDate: string;
  seat: string; cabin: string; aircraft: string; registration: string;
  passenger: string; status: "flown" | "upcoming" | "cancelled" | "unknown";
  sure: boolean; source: string;
};

export const blank = (source: string): Candidate => ({
  date: "", flight: "", airline: "", origin: "", destination: "", depart: "", arrive: "", arrivalDate: "",
  seat: "", cabin: "", aircraft: "", registration: "", passenger: "", status: "unknown", sure: true, source,
});

// What the reader can change on a row before it is saved.
export type Fields = { date: string; flight: string; origin: string; destination: string; depart: string; arrive: string; seat: string; cabin: string };
export const EDITABLE = ["date", "flight", "origin", "destination", "depart", "arrive", "seat", "cabin"] as const;

export type Problem = "date" | "origin" | "destination" | "same_airport" | "flight" | "time";

// What a newer itinerary says differently about a flight still ahead.
export type Change = { field: "depart" | "arrive" | "seat" | "cabin"; from: string; to: string };

export type DraftRow = {
  key: string;
  include: boolean;
  // update: a flight still ahead whose times or seat changed; remove: one the
  // source says was cancelled. Both act on the logged flight in duplicateOf.
  state: "new" | "update" | "remove" | "duplicate" | "cancelled" | "problem";
  problems: Problem[];
  fields: Fields;
  candidate: Candidate;
  airline: string;
  km: number;
  durationMinutes: number;
  arrivalDayOffset: number;
  timeSource: TimeSource;
  sources: string[];
  sure: boolean;
  upcoming: boolean;
  duplicateOf: string | null;
  // Matched only probably: another number on the same day and route, or the same flight a day apart.
  likely?: boolean;
  changes?: Change[];
};

export type SourceReport = { name: string; size: number; format: string; flights: number; error: string | null };
