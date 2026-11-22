// Local clock times at two airports to a duration, through their IANA zones.

function offsetMinutes(instant: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(instant));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const local = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"));
  return Math.round((local - instant) / 60_000);
}

// The instant a wall-clock time happens in a zone.
export function zonedInstant(date: string, time: string, tz: string, dayOffset = 0) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day + dayOffset, hour, minute);
  let instant = wall - offsetMinutes(wall, tz) * 60_000;
  instant = wall - offsetMinutes(instant, tz) * 60_000;
  return instant;
}

export const isClock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function flightMinutes(date: string, depart: string, arrive: string, dayOffset: number, fromTz: string, toTz: string) {
  if (!isClock(depart) || !isClock(arrive) || !fromTz || !toTz) return null;
  const minutes = Math.round((zonedInstant(date, arrive, toTz, dayOffset) - zonedInstant(date, depart, fromTz)) / 60_000);
  return minutes > 10 && minutes < 24 * 60 ? minutes : null;
}

// When the day of arrival is not given: the smallest offset that gives a
// plausible flight time.
export function arrivalOffset(date: string, depart: string, arrive: string, fromTz: string, toTz: string, km: number) {
  const expected = km / 780 * 60 + 30;
  let best = 0, bestGap = Infinity;
  for (const offset of [-1, 0, 1, 2]) {
    const minutes = flightMinutes(date, depart, arrive, offset, fromTz, toTz);
    if (minutes === null) continue;
    const gap = Math.abs(minutes - expected);
    if (gap < bestGap) { best = offset; bestGap = gap; }
  }
  return best;
}

// Typical block time for a distance, for flights whose times nobody recorded.
export const estimatedMinutes = (km: number) => Math.round((km / 790) * 60 + 32);
