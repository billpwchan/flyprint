// The year film's clock, in seconds from its first frame: the finished card,
// the card clearing to the bare globe, each flight taking off and landing in
// the order it was flown, and the finished card again, held.

export const FPS = 30;

// The finished card opens the film, so its first frame (the cover in a chat or
// a feed) is the picture itself, and a loop comes back to where it ended.
const COVER = 0.5;
const UNWIND = 0.6;
const EMPTY = 0.7;
// However many flights, they take off within this long.
const FLYING = 8.8;
const SLOWEST = 1.2;
const SETTLE = 0.6;
const HOLD = 2.5;
// How long a line takes, after landing, to quiet down to the card's own light.
export const ARC_SETTLE = 0.35;

export type Leg = { start: number; land: number };

// By date, then, on one date, by the instant each left where both are known:
// local clocks would put the hop after a date-line crossing before it.
export const travelOrder = (a: { date: string; depart: string; departAt?: number }, b: { date: string; depart: string; departAt?: number }) =>
  a.date.localeCompare(b.date) || (a.departAt != null && b.departAt != null ? a.departAt - b.departAt : a.depart.localeCompare(b.depart));
export type FilmPlan = { legs: Leg[]; every: number; cover: number; unwound: number; landed: number; finished: number; total: number; frames: number };

const clamp = (x: number) => Math.min(1, Math.max(0, x));

// From 0 at `from` to 1 `length` seconds later.
export const ramp = (t: number, from: number, length: number) => length > 0 ? clamp((t - from) / length) : t >= from ? 1 : 0;
export const ease = (x: number) => x * x * (3 - 2 * x);
// How far along a flight is at `t`: slow off the ground, slow onto it.
export const flown = (leg: Leg, t: number) => ease(ramp(t, leg.start, leg.land - leg.start));

// A few flights each get their moment; many go quicker, never past the cap.
// A long haul takes longer to draw than a hop, as it does to fly. While there
// is time, a flight lands before the next takes off, so a connection leaves a
// city only once the line has reached it and the caption names the one line
// moving; a crowded year overlaps.
export function planFilm(minutes: number[]): FilmPlan {
  const count = minutes.length;
  const every = Math.min(SLOWEST, FLYING / Math.max(1, count));
  const draw = Math.max(0.6, every * 0.8);
  const longest = Math.max(1, ...minutes);
  const first = COVER + UNWIND + EMPTY;
  const legs = minutes.map((length, index) => {
    const start = first + index * every;
    return { start, land: start + draw * (0.75 + 0.5 * Math.sqrt(Math.max(0, length) / longest)) };
  });
  const landed = Math.max(first, ...legs.map((leg) => leg.land));
  const finished = landed + SETTLE;
  const total = finished + HOLD;
  return { legs, every, cover: COVER, unwound: COVER + UNWIND, landed, finished, total, frames: Math.round(total * FPS) };
}
