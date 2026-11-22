import type { Locale } from "./i18n";

// An hour: temperature (°C), WMO weather code, cloud cover (%), precipitation (mm), 1 by day.
export type WeatherHour = [temp: number | null, code: number | null, cloud: number | null, rain: number | null, day: number | null];
export type WeatherDay = { hi: number; lo: number; code: number; rain: number; hours: WeatherHour[] };

export type Kind = "clear" | "partly" | "overcast" | "fog" | "drizzle" | "rain" | "snow" | "storm";

// WMO codes as Open-Meteo gives them, with how hard it falls (1 to 3).
export function kindOf(code: number): { kind: Kind; strength: number } {
  if (code <= 1) return { kind: "clear", strength: 1 };
  if (code === 2) return { kind: "partly", strength: 1 };
  if (code === 3) return { kind: "overcast", strength: 1 };
  if (code === 45 || code === 48) return { kind: "fog", strength: 1 };
  if (code >= 51 && code <= 57) return { kind: "drizzle", strength: 1 };
  if (code === 61 || code === 80 || code === 66) return { kind: "rain", strength: 1 };
  if (code === 63 || code === 81) return { kind: "rain", strength: 2 };
  if (code === 65 || code === 82 || code === 67) return { kind: "rain", strength: 3 };
  if (code === 71 || code === 77 || code === 85) return { kind: "snow", strength: 1 };
  if (code === 73) return { kind: "snow", strength: 2 };
  if (code === 75 || code === 86) return { kind: "snow", strength: 3 };
  if (code >= 95) return { kind: "storm", strength: 3 };
  return { kind: "overcast", strength: 1 };
}

const WORDS: Record<Locale, Record<Kind, [string, string, string]>> = {
  "zh-Hans": { clear: ["晴", "晴", "晴"], partly: ["多云", "多云", "多云"], overcast: ["阴", "阴", "阴"], fog: ["雾", "雾", "雾"], drizzle: ["毛毛雨", "毛毛雨", "毛毛雨"], rain: ["小雨", "中雨", "大雨"], snow: ["小雪", "中雪", "大雪"], storm: ["雷雨", "雷雨", "雷雨"] },
  "zh-Hant": { clear: ["晴", "晴", "晴"], partly: ["多雲", "多雲", "多雲"], overcast: ["陰", "陰", "陰"], fog: ["霧", "霧", "霧"], drizzle: ["微雨", "微雨", "微雨"], rain: ["小雨", "中雨", "大雨"], snow: ["小雪", "中雪", "大雪"], storm: ["雷雨", "雷雨", "雷雨"] },
  en: { clear: ["Clear", "Clear", "Clear"], partly: ["Some cloud", "Some cloud", "Some cloud"], overcast: ["Overcast", "Overcast", "Overcast"], fog: ["Fog", "Fog", "Fog"], drizzle: ["Drizzle", "Drizzle", "Drizzle"], rain: ["Light rain", "Rain", "Heavy rain"], snow: ["Light snow", "Snow", "Heavy snow"], storm: ["Thunderstorm", "Thunderstorm", "Thunderstorm"] },
};

export function weatherWord(code: number, locale: Locale) {
  const { kind, strength } = kindOf(code);
  return WORDS[locale][kind][strength - 1];
}

export const degrees = (value: number) => `${Math.round(value)}°`;

// The hour a local "HH:MM" falls in, to the nearest hour.
export function hourOf(clock: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(clock);
  if (!match) return null;
  return Math.min(23, Number(match[1]) + (Number(match[2]) >= 30 ? 1 : 0));
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// What a window shows: the sky by the sun's height (degrees above the
// horizon), greyed by cloud, and what is falling past it. The iOS app draws
// the same from Features/Weather.swift.
export type WindowLook = {
  top: [number, number, number];
  bottom: [number, number, number];
  sun: number;
  moon: number;
  stars: number;
  cloud: number;
  // A sky closed over: its underside drawn as soft bands.
  deck: number;
  fall: "rain" | "snow" | null;
  amount: number;
  fog: boolean;
  bolt: boolean;
};

type RGB = [number, number, number];
const SKY: [number, RGB, RGB][] = [
  [-12, [7, 11, 24], [16, 26, 51]],
  [-6, [18, 28, 60], [58, 62, 106]],
  [-2, [35, 48, 94], [199, 122, 90]],
  [2, [74, 111, 168], [242, 166, 110]],
  [10, [63, 124, 201], [169, 205, 235]],
  [30, [43, 111, 204], [140, 192, 238]],
];
const OVERCAST_DAY: [RGB, RGB] = [[104, 114, 128], [146, 155, 167]];
const OVERCAST_NIGHT: [RGB, RGB] = [[17, 21, 29], [28, 34, 45]];

const mix = (a: RGB, b: RGB, t: number): RGB => a.map((value, k) => value + (b[k] - value) * t) as RGB;

function skyAt(elevation: number): [RGB, RGB] {
  const e = Math.max(SKY[0][0], Math.min(SKY.at(-1)![0], elevation));
  let i = 1;
  while (i < SKY.length - 1 && e > SKY[i][0]) i++;
  const [e0, t0, b0] = SKY[i - 1], [e1, t1, b1] = SKY[i];
  const t = (e - e0) / (e1 - e0 || 1);
  return [mix(t0, t1, t), mix(b0, b1, t)];
}

export function windowLook(elevation: number, cloudCover: number, code: number): WindowLook {
  const { kind, strength } = kindOf(code);
  const falling = kind === "rain" || kind === "drizzle" || kind === "snow" || kind === "storm";
  // Rain and fog come with a sky that is mostly grey, whatever the cover says.
  const cloud = Math.min(1, Math.max(cloudCover / 100, falling || kind === "fog" ? 0.85 : kind === "overcast" ? 0.9 : 0));
  const daylight = Math.max(0, Math.min(1, (elevation + 6) / 12));
  const [top, bottom] = skyAt(elevation);
  const grey = [mix(OVERCAST_NIGHT[0], OVERCAST_DAY[0], daylight), mix(OVERCAST_NIGHT[1], OVERCAST_DAY[1], daylight)];
  const veil = Math.pow(cloud, 1.4);
  const clearSky = Math.max(0, 1 - cloud / 0.6);
  return {
    top: mix(top, grey[0], veil),
    bottom: mix(bottom, grey[1], veil),
    sun: elevation > -1 ? clearSky : 0,
    moon: elevation < -6 ? clearSky * 0.9 : 0,
    stars: elevation < -9 ? clearSky : 0,
    cloud: kind === "partly" || (cloud > 0.2 && cloud < 0.8) ? cloud : 0,
    deck: cloud >= 0.8 ? cloud : 0,
    fall: kind === "snow" ? "snow" : falling ? "rain" : null,
    amount: kind === "drizzle" ? 1 : strength,
    fog: kind === "fog",
    bolt: kind === "storm",
  };
}

// A day's window shows it at midday.
export const NOON = 40;

const WET = new Set<Kind>(["drizzle", "rain", "snow", "storm"]);

// What the day was like while it was light (08:00 to 19:00): Open-Meteo's
// daily code is the worst hour, so one evening shower would make a sunny
// day read as rain. Rain or fog counts when it lasted three hours or more.
export function daytime(day: WeatherDay): { code: number; cloud: number } {
  const hours = day.hours.slice(8, 20);
  const cloud = hours.reduce((sum, hour) => sum + (hour[2] ?? 0), 0) / Math.max(1, hours.length);
  const codes = hours.map((hour) => hour[1]).filter((code): code is number => code !== null);
  const wet = codes.filter((code) => WET.has(kindOf(code).kind));
  if (wet.length >= 3) {
    // The kind that fell longest, at the strength it mostly fell.
    const tally = new Map<number, number>();
    for (const code of wet) tally.set(code, (tally.get(code) ?? 0) + 1);
    return { code: [...tally].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0], cloud };
  }
  if (codes.filter((code) => kindOf(code).kind === "fog").length >= 3) return { code: 45, cloud };
  return { code: cloud < 25 ? 0 : cloud < 80 ? 2 : 3, cloud };
}
