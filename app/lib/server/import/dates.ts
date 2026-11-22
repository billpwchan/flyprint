// Dates and clock times as exports write them, to "YYYY-MM-DD" and "HH:MM".

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (value: number) => String(value).padStart(2, "0");

export function isDay(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1950 && year <= 2100 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const day = (year: number, month: number, date: number) => {
  const value = `${year}-${pad(month)}-${pad(date)}`;
  return isDay(value) ? value : "";
};

// Which way a column writes ambiguous dates, judged from all its values:
// any first part over 12 means day first, any second part over 12 month first.
export type DayOrder = "dmy" | "mdy";
export function dayOrderOf(values: string[]): DayOrder {
  for (const value of values) {
    const match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (!match) continue;
    if (Number(match[1]) > 12) return "dmy";
    if (Number(match[2]) > 12) return "mdy";
  }
  return "dmy";
}

export function parseDay(raw: string, order: DayOrder = "dmy"): string {
  const value = raw.trim();
  if (!value) return "";
  let match = value.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (match) return day(Number(match[1]), Number(match[2]), Number(match[3]));
  match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T|$)/);
  if (match) return day(Number(match[1]), Number(match[2]), Number(match[3]));
  match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    const [first, second] = [Number(match[1]), Number(match[2])];
    return order === "mdy" ? day(year, first, second) : day(year, second, first);
  }
  match = value.match(/^(\d{1,2})\s*([a-z]{3})[a-z]*\.?,?\s*(\d{4})/i);
  if (match && MONTHS[match[2].toLowerCase()]) return day(Number(match[3]), MONTHS[match[2].toLowerCase()], Number(match[1]));
  match = value.match(/^([a-z]{3})[a-z]*\.?\s*(\d{1,2}),?\s*(\d{4})/i);
  if (match && MONTHS[match[1].toLowerCase()]) return day(Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2]));
  // A spreadsheet serial: days since 1899-12-30.
  if (/^\d{5}(\.\d+)?$/.test(value)) {
    const serial = Number(value);
    if (serial > 18000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
  }
  return "";
}

export function parseClock(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  // A time inside a date-time: "2019-07-01T10:30", "2019-07-01 10:30:00".
  const inside = value.match(/^\d{4}\D\d{1,2}\D\d{1,2}\D*?[T\s]\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)/i);
  if (inside) return parseClock(inside[1]);
  // A spreadsheet fraction of a day, or a serial date with one.
  if (/^\d*\.\d+$/.test(value)) {
    const minutes = Math.round((Number(value) % 1) * 1440);
    return minutes >= 1440 ? "" : `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  }
  const match = value.match(/^(上午|下午|晚上|凌晨|中午)?\s*(\d{1,2})[:：.h](\d{2})(?::\d{2})?\s*([ap])?\.?m?\.?/i)
    ?? value.match(/^(上午|下午|晚上|凌晨|中午)?\s*(\d{2})(\d{2})()$/);
  if (!match) return "";
  let hour = Number(match[2]);
  const minute = Number(match[3]);
  const meridiem = match[4]?.toLowerCase();
  if ((meridiem === "p" || match[1] === "下午" || match[1] === "晚上") && hour < 12) hour += 12;
  if ((meridiem === "a" || match[1] === "凌晨") && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return "";
  return `${pad(hour)}:${pad(minute)}`;
}

// "2019-07-02T01:10" beside a departure on the first: the day of arrival.
export function dayOfDateTime(raw: string) {
  return /^\d{4}\D\d{1,2}\D\d{1,2}/.test(raw.trim()) ? parseDay(raw) : "";
}

export const today = () => new Date().toISOString().slice(0, 10);

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
