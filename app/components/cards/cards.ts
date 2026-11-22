import type { Flight, Person } from "../../lib/data";
import { carrierAssets } from "../../lib/data";
import { describeSky, formatDuration, formatLegDate, formatNumber, ui } from "../../lib/copy";
import { lightRGBA, skyAlong, type Sky } from "../../lib/daylight";
import { localModel } from "../../lib/fleet";
import { brandName, carrierName, type Locale } from "../../lib/i18n";
import { MARK } from "../../lib/mark.mjs";
import { bowsOf, sideOf } from "../../lib/network";
import { toneColor } from "../../lib/palette";
import { airportOfMetro, cityOf, coordinatesOf, countriesIn, metroOf, positionOf } from "../../lib/places";
import { residenceOf } from "../../lib/residence";
import type { Trip } from "../../lib/trips";
import { aircraftType } from "../../lib/aircraft/catalog";
import { draw as drawAircraft } from "../../lib/aircraft/profile";
import type { LngLat } from "../../lib/geo";
import { arcPath, CARD, drawStill, frame, loadWorld, projector, viewOf, type ArcSpec, type DotSpec, type Still } from "./globe";

// Pictures made to be sent: a year (or every year), a trip, a flight. Each is
// the night globe with the flights drawn as light, and time in the air shown
// as the colour of the sky outside the window. The same cards as the iOS app
// (ios/Flyprint/Features/Cards.swift), laid out on a 360 × 480 point card and
// printed at four times that, 1440 × 1920.

export type CardRequest = { kind: "year"; year: number | null } | { kind: "trip"; trip: Trip } | { kind: "flight"; flight: Flight; ordinal: number | null };
export type CardContext = { locale: Locale; owner: Person; flown: Flight[] };

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };
const SUN = "rgb(255, 209, 153)";
const t = (locale: Locale, hans: string, hant: string, en: string) => locale === "en" ? en : locale === "zh-Hant" ? hant : hans;
const white = (alpha: number) => `rgba(255, 255, 255, ${alpha})`;

// MARK: The sky, for print

// The app's sky colours, with night lifted enough to read on a dark card.
function cardSky(degrees: number) {
  const [r, g, b, a] = lightRGBA(degrees);
  const alpha = Math.min(1, Math.max(0.42, 0.42 + (0.58 * (a - 0.24)) / (0.86 - 0.24)));
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha.toFixed(3)})`;
}

type Stops = [number, string][];
function skyStops(sky: Sky | null): Stops {
  if (!sky || !sky.light.length) return [[0, cardSky(20)], [1, cardSky(20)]];
  const step = Math.max(1, Math.floor(sky.light.length / 24));
  return sky.light.filter((_, index) => index % step === 0 || index === sky.light.length - 1).map((point) => [point.at, cardSky(point.degrees)]);
}

function gradient(ctx: CanvasRenderingContext2D, stops: Stops, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) g.addColorStop(Math.min(1, Math.max(0, at)), color);
  return g;
}

const skyOf = (flight: Flight) => flight.departAt && flight.durationMinutes > 0
  ? skyAlong(coordinatesOf(flight.origin), coordinatesOf(flight.destination), flight.departAt, flight.durationMinutes)
  : null;

// MARK: Type

let family = "system-ui, sans-serif";
function font(ctx: Ctx, size: number, weight: number, tracking = 0) {
  ctx.font = `${weight} ${size}px ${family}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${tracking}px`;
}
// Where a line's baseline sits under its top, as SwiftUI sets the system font.
const ascent = (size: number) => size * 0.952;
const lineHeight = (size: number) => size * 1.193;

function text(ctx: Ctx, value: string, x: number, baseline: number, size: number, weight: number, alpha: number, align: CanvasTextAlign = "left", tracking = 0) {
  font(ctx, size, weight, tracking);
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = white(alpha);
  ctx.fillText(value, x, baseline);
  return ctx.measureText(value).width;
}

function measure(ctx: Ctx, value: string, size: number, weight: number, tracking = 0) {
  font(ctx, size, weight, tracking);
  return ctx.measureText(value).width;
}

// A soft light around a small shape, in one colour: only the shape's blurred
// shadow is drawn (the shape itself is put far off the card), and added to
// what is under it, so neighbouring glows join without seams; or laid over it,
// where many marks stand close and their light must not pile up.
function glow(ctx: Ctx, shape: () => void, color: string, blur: number, strength: number, added = true) {
  const away = 4000;
  ctx.save();
  ctx.globalCompositeOperation = added ? "lighter" : "source-over";
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * 2 * CARD.scale;
  ctx.shadowOffsetX = away * CARD.scale;
  ctx.globalAlpha = strength;
  ctx.translate(-away, 0);
  // Opaque, so the light's strength is the colour's own alpha alone.
  ctx.fillStyle = "#fff";
  shape();
  ctx.fill();
  ctx.restore();
}

// A glow under a bar of sky (level or upright), each stretch of it in its own
// colour, `thickness` across before the blur.
function glowAlong(ctx: Ctx, stops: Stops, from: [number, number], to: [number, number], thickness: number, blur: number, strength: number, added = true) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const pieces = Math.max(1, Math.min(24, Math.round(length / 4)));
  const colorAt = (at: number) => stops.reduce((best, stop) => Math.abs(stop[0] - at) < Math.abs(best[0] - at) ? stop : best, stops[0])[1];
  const level = Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1]);
  for (let i = 0; i < pieces; i++) {
    const a = i / pieces, b = (i + 1) / pieces;
    const x0 = from[0] + (to[0] - from[0]) * a, x1 = from[0] + (to[0] - from[0]) * b;
    const y0 = from[1] + (to[1] - from[1]) * a, y1 = from[1] + (to[1] - from[1]) * b;
    glow(ctx, () => {
      ctx.beginPath();
      if (level) ctx.rect(Math.min(x0, x1), y0 - thickness / 2, Math.abs(x1 - x0), thickness);
      else ctx.rect(x0 - thickness / 2, Math.min(y0, y1), thickness, Math.abs(y1 - y0));
    }, colorAt((a + b) / 2), blur, strength, added);
  }
}

// A soft copy of whatever `draw` paints in a box, in its own colours: drawn
// into a layer, blurred by halving it a few times and stretching it back
// (canvas filters aren't in every browser), then laid over the card.
function soft(ctx: Ctx, box: [number, number, number, number], sigma: number, strength: number, draw: (layer: CanvasRenderingContext2D) => void) {
  const s = CARD.scale, pad = sigma * 3;
  const halvings = Math.max(1, Math.round(Math.log2((sigma * s) / 0.7)));
  const k = 2 ** halvings;
  const w = Math.ceil(((box[2] + pad * 2) * s) / k) * k, h = Math.ceil(((box[3] + pad * 2) * s) / k) * k;
  const x = box[0] - pad, y = box[1] - pad;
  let layer = document.createElement("canvas");
  layer.width = w;
  layer.height = h;
  const l = layer.getContext("2d")!;
  l.setTransform(s, 0, 0, s, -x * s, -y * s);
  draw(l);
  const spent = [layer];
  for (let i = 0; i < halvings; i++) {
    const next = document.createElement("canvas");
    next.width = layer.width / 2;
    next.height = layer.height / 2;
    const c = next.getContext("2d")!;
    c.imageSmoothingQuality = "high";
    c.drawImage(layer, 0, 0, next.width, next.height);
    spent.push(next);
    layer = next;
  }
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(layer, x, y, w / s, h / s);
  ctx.restore();
  // Released at once: Safari caps the memory all canvases on a page may hold.
  for (const canvas of spent) canvas.width = canvas.height = 0;
}

// Where the sun came up or went down: a warm point in its own light.
function sunDot(ctx: Ctx, x: number, y: number, radius: number, blur = 2.2) {
  glow(ctx, () => { ctx.beginPath(); ctx.arc(x, y, radius * 2, 0, Math.PI * 2); }, "rgba(255, 209, 153, 0.9)", blur, 1);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = SUN;
  ctx.fill();
}

// MARK: What every card shares

function brandMark(ctx: Ctx, x: number, y: number, width: number) {
  const k = width / 52;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.strokeStyle = MARK.colors.horizon;
  ctx.lineWidth = 0.8;
  ctx.stroke(new Path2D(MARK.horizon));
  const trail = ctx.createLinearGradient(MARK.home.x, 0, MARK.head.x, 0);
  trail.addColorStop(0, MARK.colors.trailFrom);
  trail.addColorStop(0.55, MARK.colors.trailMid);
  trail.addColorStop(1, MARK.colors.trailTo);
  ctx.fillStyle = trail;
  ctx.fill(new Path2D(MARK.trail));
  for (const [spot, colour] of [[MARK.home, MARK.colors.home], [MARK.head, MARK.colors.head]] as const) {
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, spot.r, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
  }
  ctx.restore();
}

const HEADER = { top: 22, height: 17 * 44 / 52 };
function header(ctx: Ctx, locale: Locale, right: string) {
  const middle = HEADER.top + HEADER.height / 2;
  brandMark(ctx, CARD.margin, HEADER.top, 17);
  text(ctx, brandName[locale], CARD.margin + 23, middle + 3.5, 10, 600, 0.92);
  text(ctx, right, CARD.width - CARD.margin, middle + 2.8, 8, 500, 0.42, "right");
}

// The canonical address, not whichever host this page happens to be open on.
function site() {
  const canonical = document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content;
  return new URL(canonical || location.origin).host.replace(/^www\./, "");
}

const FOOTER_BASELINE = CARD.height - 20 - 1.6;
function footer(ctx: Ctx, note: string) {
  text(ctx, note, CARD.margin, FOOTER_BASELINE, 6.5, 500, 0.42);
  text(ctx, site(), CARD.width - CARD.margin, FOOTER_BASELINE, 6.5, 500, 0.42, "right");
}

// The globe behind a card, fading out under the card's own text.
function fades(ctx: Ctx, top: number, bottom: number) {
  const upper = ctx.createLinearGradient(0, 0, 0, top + 18);
  upper.addColorStop(0, "rgba(7, 8, 11, 0.92)");
  upper.addColorStop(1, "rgba(7, 8, 11, 0)");
  ctx.fillStyle = upper;
  ctx.fillRect(0, 0, CARD.width, top + 18);
  const from = bottom - 28, height = CARD.height - from;
  const lower = ctx.createLinearGradient(0, from, 0, CARD.height);
  lower.addColorStop(0, "rgba(7, 8, 11, 0)");
  lower.addColorStop(0.55, "rgba(7, 8, 11, 0.96)");
  lower.addColorStop(1, "rgba(7, 8, 11, 0.96)");
  ctx.fillStyle = lower;
  ctx.fillRect(0, from, CARD.width, height);
}

// MARK: Names on the globe

type Wanted = { code: string; text: string; at: LngLat; strong: boolean };
type Box = [number, number, number, number];

// The flights as drawn on the card, as points no more than 3 apart.
function traced(still: Still) {
  const { project } = viewOf(still.camera, still.middle);
  const points: [number, number][] = [];
  for (const arc of still.arcs) {
    let last: [number, number] | null = null;
    for (const p of arcPath(arc.from, arc.to, arc.bow)) {
      const point = project(p);
      if (point && last) {
        const steps = Math.ceil(Math.hypot(point[0] - last[0], point[1] - last[1]) / 3);
        for (let i = 1; i < steps; i++) points.push([last[0] + ((point[0] - last[0]) * i) / steps, last[1] + ((point[1] - last[1]) * i) / steps]);
      }
      if (point) points.push(point);
      last = point;
    }
  }
  return points;
}

// Each name beside its city where it fits: right, left, above, below; clear of
// the names already placed and of the card's own text, and off the flights'
// lines where any side allows it.
function names(ctx: Ctx, wanted: Wanted[], still: Still, avoid: Box[], limit: number) {
  const project = projector(still);
  const taken = [...avoid];
  const line = traced(still);
  let count = 0;
  const hits = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const crossed = (box: Box) => line.some(([x, y]) => x > box[0] && x < box[2] && y > box[1] && y < box[3]);
  for (const item of wanted) {
    if (count >= limit) break;
    const dot = project(item.at);
    if (!dot) continue;
    const size = item.strong ? 9 : 8, weight = item.strong ? 600 : 500;
    const w = Math.ceil(measure(ctx, item.text, size, weight)), h = Math.ceil(lineHeight(size));
    const gap = 5;
    const spots: [number, number][] = [[dot[0] + gap + w / 2, dot[1]], [dot[0] - gap - w / 2, dot[1]], [dot[0], dot[1] - gap - h / 2], [dot[0], dot[1] + gap + h / 2]];
    const fits = spots.map(([x, y]) => ({ x, y, box: [x - w / 2 - 2, y - h / 2 - 1, x + w / 2 + 2, y + h / 2 + 1] as Box }))
      .filter(({ box }) => box[0] >= 12 && box[1] >= 12 && box[2] <= CARD.width - 12 && box[3] <= CARD.height - 12 && !taken.some((other) => hits(other, box)));
    const pick = fits.find(({ box }) => !crossed(box)) ?? fits[0];
    if (pick) {
      const { x, y, box } = pick;
      taken.push(box, [dot[0] - 3, dot[1] - 3, dot[0] + 3, dot[1] + 3]);
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 2.5 * 2 * CARD.scale;
      text(ctx, item.text, x, y - h / 2 + ascent(size) - (h - size * 1.193) / 2, size, weight, item.strong ? 0.92 : 0.66, "center");
      ctx.restore();
      count++;
    }
  }
}

const bands = (top: number, bottom: number): Box[] => [[0, 0, CARD.width, top], [0, bottom - 4, CARD.width, CARD.height]];

// The flights as light on the globe, framed in the band between the card's text.
function still(flights: Flight[], owner: Person, top: number, bottom: number, directed: boolean, width: number): Still {
  const color = toneColor(owner.tone);
  const bows = bowsOf(flights);
  const arcs: ArcSpec[] = flights.flatMap((flight) => {
    const from = positionOf(flight.origin), to = positionOf(flight.destination);
    return from && to ? [{ from, to, bow: bows.get(flight.id) ?? 0.07, color, alpha: directed ? 1 : 0.75, width }] : [];
  });
  const visits = new Map<string, number>();
  for (const flight of flights) for (const code of [flight.origin, flight.destination]) visits.set(code, (visits.get(code) ?? 0) + 1);
  const dots: DotSpec[] = [...visits].flatMap(([code, count]) => {
    const at = positionOf(code);
    return at ? [{ at, radius: directed ? 2.2 : count >= 10 ? 1.9 : 1.4, alpha: directed ? 1 : 0.8 }] : [];
  });
  const middle: [number, number] = [CARD.width / 2, (top + bottom) / 2 + 2];
  return { arcs, dots, camera: frame(arcs, middle, (bottom - top) / 2 - 6), middle, directed, glow: directed ? 6 : 5, glowGain: directed ? 0.24 : 0.2 };
}

// MARK: Words

function distance(km: number, locale: Locale) {
  if (locale !== "en") {
    if (km >= 10_000) return `${formatNumber(km / 10_000, locale, 1).replace(/\.0$/, "")} ${t(locale, "万公里", "萬公里", "")}`;
    return `${formatNumber(km, locale)} 公里`;
  }
  // No more figures than the distance is good for.
  const rounded = km >= 100_000 ? Math.round(km / 1000) * 1000 : km >= 10_000 ? Math.round(km / 100) * 100 : Math.round(km);
  return `${formatNumber(rounded, locale)} km`;
}

function sunsLine(rises: number, sets: number, locale: Locale) {
  if (!rises && !sets) return null;
  const rise = t(locale, `${rises} 次日出`, `${rises} 次日出`, rises === 1 ? "1 sunrise" : `${rises} sunrises`);
  const set = t(locale, `${sets} 次日落`, `${sets} 次日落`, sets === 1 ? "1 sunset" : `${sets} sunsets`);
  const both = rises && sets ? t(locale, `${rise}、${set}`, `${rise}、${set}`, `${rise} and ${set}`) : rises ? rise : set;
  return t(locale, `途中 ${both}`, `途中 ${both}`, `${both} on the way`);
}

// "2026年11月26日至27日" / "26–27 Nov 2026", the year said once.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function span(start: string, end: string, locale: Locale) {
  const [sy, sm, sd] = start.split("-").map(Number), [ey, em, ed] = end.split("-").map(Number);
  if (locale === "en") {
    if (start === end) return `${sd} ${MONTHS[sm - 1]} ${sy}`;
    if (sy === ey && sm === em) return `${sd}–${ed} ${MONTHS[sm - 1]} ${sy}`;
    if (sy === ey) return `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]} ${sy}`;
    return `${sd} ${MONTHS[sm - 1]} ${sy} – ${ed} ${MONTHS[em - 1]} ${ey}`;
  }
  if (start === end) return `${sy}年${sm}月${sd}日`;
  if (sy === ey && sm === em) return `${sy}年${sm}月${sd}日至${ed}日`;
  if (sy === ey) return `${sy}年${sm}月${sd}日至${em}月${ed}日`;
  return `${sy}年${sm}月${sd}日至${ey}年${em}月${ed}日`;
}

// The sun's line beside a figure: a warm dot, then the words, right-aligned.
function sunsRight(ctx: Ctx, line: string | null, baseline: number) {
  if (!line) return;
  const w = text(ctx, line, CARD.width - CARD.margin, baseline, 8, 500, 0.62, "right");
  sunDot(ctx, CARD.width - CARD.margin - w - 5.5, baseline - 2.8, 1.5);
}

// MARK: A year

type Mark = { minutes: number; stops: Stops; suns: number[] };

const DAY = 86_400_000;
const dayIndex = (from: string, date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

function yearStory(flown: Flight[], year: number | null, locale: Locale) {
  const flights = flown.filter((flight) => sideOf(flight) !== "them" && (year === null || flight.year === year))
    .sort((a, b) => a.date.localeCompare(b.date) || a.depart.localeCompare(b.depart));
  const years = [...new Set(flights.map((flight) => flight.year))].sort((a, b) => a - b);
  const firstYear = year ?? years[0] ?? new Date().getUTCFullYear(), lastYear = year ?? years.at(-1) ?? firstYear;
  const start = `${firstYear}-01-01`;
  let sunrises = 0, sunsets = 0;
  const byDay = new Map<number, Mark[]>();
  for (const flight of flights) {
    const sky = skyOf(flight);
    for (const event of sky?.events ?? []) if (event.kind === "sunrise") sunrises++; else sunsets++;
    const day = dayIndex(start, flight.date);
    const list = byDay.get(day) ?? [];
    list.push({ minutes: flight.durationMinutes, stops: skyStops(sky), suns: (sky?.events ?? []).map((event) => event.minute / Math.max(1, flight.durationMinutes)) });
    byDay.set(day, list);
  }
  const days = dayIndex(start, `${lastYear + 1}-01-01`);
  const ticks: [number, string][] = year === null
    ? Array.from({ length: Math.floor((lastYear - firstYear) / (lastYear - firstYear > 11 ? 2 : 1)) + 1 }, (_, i) => {
      const y = firstYear + i * (lastYear - firstYear > 11 ? 2 : 1);
      return [dayIndex(start, `${y}-01-01`), String(y)];
    })
    : Array.from({ length: 12 }, (_, i) => [dayIndex(start, `${firstYear}-${String(i + 1).padStart(2, "0")}-01`), locale === "en" ? MONTHS[i] : `${i + 1}月`]);
  const visits = new Map<string, number>();
  for (const flight of flights) for (const code of [flight.origin, flight.destination]) visits.set(metroOf(code), (visits.get(metroOf(code)) ?? 0) + 1);
  const end = `${lastYear}-12-31`;
  const homes = new Set(residenceOf(flown).homes.filter((home) => home.from <= end && (home.to ?? "9999") >= start).map((home) => metroOf(home.code)));
  const places = [...visits].sort((a, b) => Number(homes.has(b[0])) - Number(homes.has(a[0])) || b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([code]) => code);
  return {
    year, flights, days, ticks, columns: [...byDay].sort((a, b) => a[0] - b[0]),
    km: flights.reduce((sum, flight) => sum + flight.km, 0),
    minutes: flights.reduce((sum, flight) => sum + flight.durationMinutes, 0),
    countries: countriesIn(flights).size,
    cities: visits.size,
    sunrises, sunsets, places, span: [firstYear, lastYear] as const,
    first: flights[0]?.date ?? "", last: flights.at(-1)?.date ?? "",
  };
}

// Flights placed on a run of days: a column per day, as tall as the time
// aloft, coloured from take-off up to landing by the sky outside.
function skyLine(ctx: Ctx, story: ReturnType<typeof yearStory>, top: number, height: number, width: number) {
  const left = CARD.margin, full = CARD.width - CARD.margin * 2;
  const perDay = full / Math.max(1, story.days);
  // Fourteen hours fill the band, unless a day held more: then that day does,
  // so a long-haul or a run of flights never reaches the words above.
  const columns = story.columns.map(([, marks]) => marks);
  const tallest = Math.max(14 * 60, ...columns.map((marks) => marks.reduce((sum, mark) => sum + mark.minutes, 0)));
  const room = height - Math.max(0, ...columns.map((marks) => marks.length - 1));
  ctx.fillStyle = white(0.1);
  ctx.fillRect(left, top + height - 0.5, full, 0.5);
  const bars: { x: number; y: number; h: number; stops: Stops }[] = [];
  const suns: [number, number][] = [];
  for (const [day, marks] of story.columns) {
    const x = left + (day + 0.5) * perDay - width / 2;
    let bottom = top + height;
    for (const mark of marks) {
      const h = Math.max(1.5, (mark.minutes / tallest) * room);
      bars.push({ x, y: bottom - h, h, stops: mark.stops });
      for (const at of mark.suns) suns.push([x + width / 2, bottom - at * h]);
      bottom -= h + 1;
    }
  }
  // Every mark's glow at once, in its own colours, laid over (not added) so
  // close marks don't pile their light up.
  soft(ctx, [left, top - 4, full, height + 4], width * 1.5, 0.6, (l) => {
    for (const bar of bars) {
      l.fillStyle = gradient(l, bar.stops, 0, bar.y + bar.h, 0, bar.y);
      l.fillRect(bar.x - width / 2, bar.y - 0.5, width * 2, bar.h + 1);
    }
  });
  for (const bar of bars) {
    ctx.beginPath();
    ctx.roundRect(bar.x, bar.y, width, bar.h, width / 2);
    ctx.fillStyle = gradient(ctx, bar.stops, 0, bar.y + bar.h, 0, bar.y);
    ctx.fill();
  }
  for (const [x, y] of suns) sunDot(ctx, x, y, 1.3);
  for (const [day, label] of story.ticks) text(ctx, label, left + day * perDay, top + height + 4 + ascent(6.5), 6.5, 500, 0.42);
}

async function yearCard(ctx: Ctx, request: { year: number | null }, context: CardContext) {
  const { locale, owner } = context;
  const story = yearStory(context.flown, request.year, locale);
  if (!story.flights.length) throw new Error("empty");
  const top = request.year === null ? 124 : 104, bottom = 386;
  const count = story.flights.length;
  const view = still(story.flights, owner, top, bottom, false, count < 12 ? 1.15 : count < 40 ? 0.95 : 0.75);
  await drawStill(ctx, view);
  fades(ctx, top, bottom);
  const wanted = story.places.slice(0, 14).flatMap((metro, index) => {
    const code = airportOfMetro(metro);
    const at = positionOf(code);
    return at ? [{ code: metro, text: cityOf(code, locale), at, strong: index < 6 }] : [];
  });
  names(ctx, wanted, view, bands(top, bottom), 11);

  const a = story.first.replaceAll("-", "."), b = story.last.replaceAll("-", ".");
  header(ctx, locale, story.first ? (request.year === null ? `${a} – ${b}` : `${a} – ${b.slice(5)}`) : "");
  const title = request.year !== null ? String(request.year) : story.span[0] === story.span[1] ? String(story.span[0]) : `${story.span[0]} – ${story.span[1]}`;
  const facts = [distance(story.km, locale),
    t(locale, `${story.cities} 座城市`, `${story.cities} 座城市`, story.cities === 1 ? "1 city" : `${story.cities} cities`),
    t(locale, `${story.countries} 个国家和地区`, `${story.countries} 個國家和地區`, story.countries === 1 ? "1 country" : `${story.countries} countries`)];
  const flightsWord = t(locale, "次飞行", "次飛行", count === 1 ? "flight" : "flights");
  const headerBottom = HEADER.top + HEADER.height;
  if (request.year !== null) {
    const titleTop = headerBottom + 8;
    const baseline = titleTop + ascent(60);
    const titleWidth = text(ctx, title, CARD.margin, baseline, 60, 600, 0.95, "left", -1.8);
    const right = CARD.width - CARD.margin;
    const room = CARD.width - CARD.margin * 2 - titleWidth - 10;
    const one = facts.join(" · ");
    const lines = measure(ctx, one, 8.5, 500) <= room ? [one] : [`${facts[0]} · ${facts[1]}`, facts[2]];
    lines.forEach((line, index) => text(ctx, line, right, baseline - (lines.length - 1 - index) * lineHeight(8.5), 8.5, 500, 0.62, "right"));
    const countBaseline = baseline - (lines.length - 1) * lineHeight(8.5) - ascent(8.5) - 3 - (lineHeight(15) - ascent(15));
    const wordWidth = text(ctx, flightsWord, right, countBaseline, 10, 500, 0.62, "right");
    text(ctx, String(count), right - wordWidth - 4, countBaseline, 15, 600, 0.95, "right");
  } else {
    const titleTop = headerBottom + 10;
    text(ctx, title, CARD.margin, titleTop + ascent(42), 42, 600, 0.95, "left", -1.2);
    const figuresTop = titleTop + lineHeight(42) + 4;
    const countBaseline = figuresTop + ascent(15);
    const countWidth = text(ctx, String(count), CARD.margin, countBaseline, 15, 600, 0.95);
    text(ctx, flightsWord, CARD.margin + countWidth + 4, countBaseline, 10, 500, 0.62);
    text(ctx, facts.join(" · "), CARD.margin, figuresTop + lineHeight(15) + 3 + ascent(8.5), 8.5, 500, 0.62);
  }

  // Time in the air, and the sky it was spent in.
  const footerTop = FOOTER_BASELINE - ascent(6.5);
  const lineTop = footerTop - 7 - 48;
  const aloftBaseline = lineTop - 7 - (lineHeight(9) - ascent(9));
  const hours = Math.round(story.minutes / 60);
  text(ctx, t(locale, `在天上 ${formatNumber(hours, locale)} 小时`, `在天上 ${formatNumber(hours, locale)} 小時`, hours === 1 ? "1 hour in the air" : `${formatNumber(hours, locale)} hours in the air`), CARD.margin, aloftBaseline, 9, 600, 0.92);
  sunsRight(ctx, sunsLine(story.sunrises, story.sunsets, locale), aloftBaseline);
  skyLine(ctx, story, lineTop, 36, request.year === null ? 1 : 1.5);
  footer(ctx, t(locale, "每一道是一次飞行，颜色是当时窗外的天色", "每一道是一次飛行，顏色是當時窗外的天色", "Each mark is a flight, in the colours of the sky outside"));
}

// MARK: A trip

type Piece = { air: boolean; hours: number; stops: Stops | null; suns: number[]; city: string; nights: number; change?: boolean };

// How long the ground between two legs lasted: as the trip measured it, else
// from the clocks, else from the nights.
function stayHours(leg: Flight, next: Flight, gap: Trip["gaps"][number] | undefined) {
  if (gap?.minutes != null) return gap.minutes / 60;
  if (leg.departAt != null && next.departAt != null) return Math.max(0, (next.departAt - leg.departAt) / 3_600_000 - leg.durationMinutes / 60);
  return (gap?.nights ?? 0) * 24;
}

// Each piece as long as it lasted, but a flight never thinner than a mark
// and a stay never so short its name can't sit over it.
function pieceWidths(pieces: Piece[], total: number) {
  const hours = pieces.reduce((sum, piece) => sum + Math.max(0.01, piece.hours), 0);
  let widths = pieces.map((piece) => (Math.max(0.01, piece.hours) / hours) * total);
  const least = (piece: Piece) => piece.air ? 10 : 6;
  for (let round = 0; round < 3; round++) {
    const short = widths.map((w, i) => w < least(pieces[i]));
    const fixed = pieces.reduce((sum, piece, i) => sum + (short[i] ? least(piece) : 0), 0);
    const free = widths.reduce((sum, w, i) => sum + (short[i] ? 0 : w), 0);
    if (free <= 0 || fixed >= total) break;
    const k = (total - fixed) / free;
    widths = widths.map((w, i) => short[i] ? least(pieces[i]) : w * k);
  }
  return widths;
}

// A trip laid out in time: bright where it was in the air (in the colours of
// the sky outside), a quiet line where it stayed, each place named over its stay.
function tripLine(ctx: Ctx, pieces: Piece[], ends: { from: string; to: string; start: string; end: string }, top: number, locale: Locale) {
  const left = CARD.margin, total = CARD.width - CARD.margin * 2;
  const widths = pieceWidths(pieces, total);
  const lineY = top + 16;
  let x = left;
  pieces.forEach((piece, index) => {
    const w = widths[index];
    if (piece.air && piece.stops) {
      const rect = [x + 1, lineY - 2, Math.max(1, w - 2), 4] as const;
      const fill = gradient(ctx, piece.stops, rect[0], 0, rect[0] + rect[2], 0);
      glowAlong(ctx, piece.stops, [rect[0] - 1, lineY], [rect[0] + rect[2] + 1, lineY], 7, 3, 0.7);
      ctx.beginPath();
      ctx.roundRect(...rect, 2);
      ctx.fillStyle = fill;
      ctx.fill();
      for (const at of piece.suns) sunDot(ctx, rect[0] + rect[2] * at, lineY, 1.5);
    } else {
      ctx.fillStyle = white(0.22);
      ctx.fillRect(x, lineY - 0.5, w, 1);
    }
    x += w;
  });
  for (const end of [left, x]) {
    ctx.beginPath();
    ctx.arc(end, lineY, 2, 0, Math.PI * 2);
    ctx.fillStyle = white(0.9);
    ctx.fill();
  }
  // Names over the stays wide enough to hold them; the ends carry the dates.
  const cityBaseline = top + ascent(9), noteBaseline = top + lineHeight(9) + 13 + ascent(7.5);
  const label = (city: string, note: string, at: number, align: CanvasTextAlign) => {
    text(ctx, city, at, cityBaseline, 9, 600, 0.92, align);
    text(ctx, note, at, noteBaseline, 7.5, 500, 0.5, align);
  };
  label(ends.from, ends.start, left, "left");
  label(ends.to, ends.end, left + total, "right");
  // The stays' names where they fit, the longest stays first, so the place
  // the trip went to is named before the cities passed through.
  // Names a word space apart would read as one name; 12 keeps them apart.
  const gap = 12;
  const taken: [number, number][] = [[left, left + measure(ctx, ends.from, 9, 600)], [left + total - measure(ctx, ends.to, 9, 600), left + total]];
  x = left;
  const stays = pieces.flatMap((piece, index) => {
    const start = x;
    x += widths[index];
    if (piece.air) return [];
    const note = piece.change ? t(locale, "转机", "轉機", "change")
      : piece.nights > 0 ? t(locale, `${piece.nights} 晚`, `${piece.nights} 晚`, piece.nights === 1 ? "1 night" : `${piece.nights} nights`)
      : t(locale, "当天", "即日", "same day");
    const half = Math.max(measure(ctx, piece.city, 9, 600), measure(ctx, note, 7.5, 500), 28) / 2;
    return [{ piece, note, start, end: x, half }];
  });
  for (const stay of [...stays].sort((a, b) => b.piece.nights - a.piece.nights)) {
    // Over the middle of its stay if there is room, else slid along it, as
    // long as it still stands over the stay it names.
    const middle = (stay.start + stay.end) / 2;
    const clear = (at: number) => !taken.some(([from, to]) => at - stay.half - gap < to && at + stay.half + gap > from);
    const at = [middle, ...taken.flatMap(([from, to]) => [from - gap - stay.half, to + gap + stay.half])]
      .filter((at) => at >= stay.start && at <= stay.end && clear(at))
      .sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0];
    if (at === undefined) continue;
    label(stay.piece.city, stay.note, at, "center");
    taken.push([at - stay.half, at + stay.half]);
  }
}

// The destination, as the app titles it; the stays on the way are in the line under it.
function cardTitle(trip: Trip, locale: Locale) {
  const city = cityOf(trip.kind === "move" ? trip.homeAfter : trip.destination, locale);
  return trip.kind === "move" ? t(locale, `迁居${city}`, `遷居${city}`, `Moved to ${city}`) : city;
}

// A trip's title at 40, smaller until it fits, down to 30; past that, two
// lines at the size the longer fits. The break is at a " · " if there is one,
// else after "Moved to", else at the space that balances the lines, so a
// city's name is split only when it is the whole title.
function titleLines(ctx: Ctx, title: string, room: number) {
  const fit = (line: string) => Math.min(40, (40 * room) / Math.max(1, measure(ctx, line, 40, 600, -0.8)));
  if (fit(title) >= 30) return { text: [title], size: fit(title) };
  const dots = [...title.matchAll(/ · /g)].map((match) => [match.index, match.index + 3]);
  const lead = title.match(/^Moved to /);
  const breaks = dots.length ? dots : lead ? [[lead[0].length - 1, lead[0].length]] : [...title.matchAll(/ /g)].map((match) => [match.index, match.index + 1]);
  const best = breaks
    .map(([end, start]) => [title.slice(0, end), title.slice(start)])
    .filter(([first, second]) => first && second)
    .map((pair) => ({ pair, size: Math.min(fit(pair[0]), fit(pair[1])) }))
    .sort((a, b) => b.size - a.size)[0];
  if (!best) return { text: [title], size: fit(title) };
  return { text: best.pair, size: Math.min(32, best.size) };
}

async function tripCard(ctx: Ctx, trip: Trip, context: CardContext) {
  const { locale, owner } = context;
  // In the trip's own order: its gaps are numbered by it.
  const legs = trip.flights;
  const pieces: Piece[] = [];
  let sunrises = 0, sunsets = 0;
  legs.forEach((leg, index) => {
    const sky = skyOf(leg);
    for (const event of sky?.events ?? []) if (event.kind === "sunrise") sunrises++; else sunsets++;
    pieces.push({ air: true, hours: leg.durationMinutes / 60, stops: skyStops(sky), suns: (sky?.events ?? []).map((event) => event.minute / Math.max(1, leg.durationMinutes)), city: "", nights: 0 });
    const next = legs[index + 1];
    if (!next) return;
    const gap = trip.gaps[index];
    pieces.push({ air: false, hours: stayHours(leg, next, gap), stops: null, suns: [], city: cityOf(gap?.at ?? leg.destination, locale), nights: gap?.kind === "connection" ? 0 : gap?.nights ?? 0, change: gap?.kind === "connection" });
  });
  const top = 112, bottom = 352;
  const view = still(legs, owner, top, bottom, true, 1.3);
  await drawStill(ctx, view);
  fades(ctx, top, bottom);
  const seen = new Set<string>();
  const stops = legs.flatMap((leg) => [leg.origin, leg.destination]).filter((code) => !seen.has(metroOf(code)) && !!seen.add(metroOf(code)));
  names(ctx, stops.flatMap((code) => { const at = positionOf(code); return at ? [{ code, text: cityOf(code, locale), at, strong: true }] : []; }), view, bands(top, bottom), 10);

  header(ctx, locale, span(trip.start, trip.end, locale));
  const titleTop = HEADER.top + HEADER.height + 14;
  const lines = titleLines(ctx, cardTitle(trip, locale), CARD.width - CARD.margin * 2);
  lines.text.forEach((line, index) => text(ctx, line, CARD.margin, titleTop + ascent(40) - (40 - lines.size) * 0.5 + index * lineHeight(lines.size), lines.size, 600, 0.95, "left", -0.8 * (lines.size / 40)));
  const titleBottom = titleTop + lineHeight(40) + (lines.text.length - 1) * lineHeight(lines.size);
  const nights = trip.nights === 0 ? t(locale, "当天", "即日", "Same day") : t(locale, `${trip.nights} 晚`, `${trip.nights} 晚`, trip.nights === 1 ? "1 night" : `${trip.nights} nights`);
  const legsWord = t(locale, `${legs.length} 段`, `${legs.length} 段`, legs.length === 1 ? "1 flight" : `${legs.length} flights`);
  const via = trip.stays.filter((code) => code !== trip.destination).map((code) => cityOf(code, locale));
  const facts = `${nights} · ${legsWord}${via.length ? ` · ${t(locale, "经", "經", "via ")}${via.join(locale === "en" ? ", " : "、")}` : ""}`;
  text(ctx, facts, CARD.margin, titleBottom + 4 + ascent(10), 10, 500, 0.62);

  const footerTop = FOOTER_BASELINE - ascent(6.5);
  const figuresBaseline = footerTop - 9 - (lineHeight(9) - ascent(9));
  const lineTop = figuresBaseline - ascent(9) - 16 - 44;
  const short = (date: string) => date.slice(5).replace("-", ".");
  tripLine(ctx, pieces, { from: cityOf(legs[0].origin, locale), to: cityOf(legs.at(-1)!.destination, locale), start: short(trip.start), end: short(trip.end) }, lineTop, locale);
  const minutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  const km = legs.reduce((sum, leg) => sum + leg.km, 0);
  const aloft = formatDuration(minutes, locale);
  text(ctx, `${t(locale, `在天上 ${aloft}`, `在天上 ${aloft}`, `${aloft} in the air`)} · ${distance(km, locale)}`, CARD.margin, figuresBaseline, 9, 600, 0.92);
  sunsRight(ctx, sunsLine(sunrises, sunsets, locale), figuresBaseline);
  footer(ctx, t(locale, "亮的一段是在天上，颜色是当时窗外的天色", "亮的一段是在天上，顏色是當時窗外的天色", "Bright where it was in the air, in the colours of the sky outside"));
}

// MARK: A flight

// An airline's mark on the dark card: in its own colours, or in white where
// those colours are too dark to see against the night.
async function carrierMark(ctx: Ctx, code: string, x: number, y: number, size: number) {
  if (!carrierAssets.has(code)) {
    text(ctx, code, x + size / 2, y + size / 2 + 4, size * 0.42, 600, 0.62, "center");
    return;
  }
  const image = new Image();
  image.src = `/airlines/${code}.webp`;
  await image.decode().catch(() => {});
  if (!image.naturalWidth) return;
  const px = Math.round(size * CARD.scale);
  const tile = document.createElement("canvas");
  tile.width = tile.height = px;
  const c = tile.getContext("2d")!;
  const k = Math.min(px / image.naturalWidth, px / image.naturalHeight);
  const w = image.naturalWidth * k, h = image.naturalHeight * k;
  c.drawImage(image, (px - w) / 2, (px - h) / 2, w, h);
  const data = c.getImageData(0, 0, px, px).data;
  let sum = 0, count = 0;
  for (let i = 0; i < data.length; i += 4 * 7) {
    const a = data[i + 3] / 255;
    if (a < 0.5) continue;
    sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255 / a;
    count++;
  }
  if (count && sum / count < 0.32) {
    c.globalCompositeOperation = "source-in";
    c.fillStyle = white(0.9);
    c.fillRect(0, 0, px, px);
  }
  ctx.drawImage(tile, x, y, size, size);
  tile.width = tile.height = 0;
}

// A type's side view in light lines, as on the flight page.
function aircraftProfile(ctx: Ctx, icao: string, x: number, centerY: number, width: number) {
  const type = aircraftType(icao.toUpperCase());
  if (!type) return 0;
  const drawing = drawAircraft(type.variant);
  const pad = 0.4;
  const k = width / (drawing.length + pad * 2);
  const height = (drawing.top - drawing.bottom + pad * 2) * k;
  ctx.save();
  ctx.translate(x + pad * k, centerY - height / 2 + (drawing.top + pad) * k);
  ctx.scale(k, k);
  const body = ctx.createLinearGradient(0, -drawing.half, 0, drawing.half);
  body.addColorStop(0, "#1a2029");
  body.addColorStop(0.55, "#0f1217");
  body.addColorStop(1, "#090b0e");
  const line = 0.55 / k;
  for (const part of drawing.parts) {
    const path = new Path2D(part.d);
    if (part.kind === "body") { ctx.fillStyle = body; ctx.fill(path); }
    if (part.kind === "line") { ctx.strokeStyle = "rgba(228, 236, 247, 0.82)"; ctx.lineWidth = line; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke(path); }
    if (part.kind === "detail") { ctx.strokeStyle = "rgba(228, 236, 247, 0.26)"; ctx.lineWidth = line; ctx.stroke(path); }
    if (part.kind === "glass") { ctx.fillStyle = "rgba(135, 174, 221, 0.2)"; ctx.fill(path); ctx.strokeStyle = "rgba(228, 236, 247, 0.5)"; ctx.lineWidth = line; ctx.stroke(path); }
    if (part.kind === "window") { ctx.fillStyle = "rgba(232, 238, 246, 0.42)"; ctx.fill(path); }
  }
  ctx.restore();
  return height;
}

const CABINS: Record<string, [string, string, string]> = {
  economy: ["经济舱", "經濟艙", "Economy"], premium: ["超级经济舱", "特選經濟艙", "Premium economy"],
  business: ["商务舱", "商務艙", "Business"], first: ["头等舱", "頭等艙", "First"],
};

async function flightCard(ctx: Ctx, flight: Flight, ordinal: number | null, context: CardContext) {
  const { locale, owner } = context;
  const top = 96, bottom = 290, ends = 296;
  const view = still([flight], owner, top, bottom, true, 1.6);
  await drawStill(ctx, view);
  fades(ctx, top, bottom);
  names(ctx, [flight.origin, flight.destination].flatMap((code) => { const at = positionOf(code); return at ? [{ code, text: cityOf(code, locale), at, strong: true }] : []; }), view, bands(top, bottom), 2);

  header(ctx, locale, formatLegDate(flight.date, locale));
  // Who flew it, and which of this person's flights it was.
  const rowTop = HEADER.top + HEADER.height + 16;
  const rowHeight = lineHeight(20) + 2 + lineHeight(9);
  await carrierMark(ctx, flight.airline, CARD.margin, rowTop + rowHeight / 2 - 14, 28);
  const number = flight.flight.replace(/^([A-Z0-9]{2})(\d)/, "$1 $2");
  text(ctx, number || `${flight.origin} – ${flight.destination}`, CARD.margin + 38, rowTop + ascent(20), 20, 600, 0.95, "left", -0.2);
  text(ctx, carrierName(flight.airline, locale), CARD.margin + 38, rowTop + lineHeight(20) + 2 + ascent(9), 9, 500, 0.62);
  if (ordinal) text(ctx, ui[locale].flight.ordinal(formatNumber(ordinal, locale)), CARD.width - CARD.margin, rowTop + rowHeight / 2 + 3, 8.5, 500, 0.62, "right");

  // The two ends joined by the sky the flight flew through.
  const end = (code: string, time: string, offset: number, align: "left" | "right") => {
    const x = align === "left" ? CARD.margin : CARD.width - CARD.margin;
    text(ctx, code, x, ends + ascent(32), 32, 600, 0.95, align, -0.3);
    const cityTop = ends + lineHeight(32) + 3;
    text(ctx, cityOf(code, locale), x, cityTop + ascent(9), 9, 500, 0.62, align);
    if (time) {
      const timeBaseline = cityTop + lineHeight(9) + 3 + ascent(11);
      const extra = offset ? (offset > 0 ? `+${offset}` : String(offset)) : "";
      const ew = extra ? measure(ctx, extra, 7, 600) + 2 : 0;
      if (align === "left") {
        const tw = text(ctx, time, x, timeBaseline, 11, 600, 0.92);
        if (extra) text(ctx, extra, x + tw + 2, timeBaseline, 7, 600, 0.62);
      } else {
        text(ctx, time, x - ew, timeBaseline, 11, 600, 0.92, "right");
        if (extra) text(ctx, extra, x, timeBaseline, 7, 600, 0.62, "right");
      }
    }
  };
  end(flight.origin, flight.depart, 0, "left");
  end(flight.destination, flight.arrive, flight.arrivalDayOffset, "right");
  const bandLeft = CARD.margin + measure(ctx, flight.origin, 32, 600, -0.3) + 10;
  const bandRight = CARD.width - CARD.margin - measure(ctx, flight.destination, 32, 600, -0.3) - 10;
  const sky = skyOf(flight);
  const bandY = ends + 13 + 6;
  if (sky) {
    const fill = gradient(ctx, skyStops(sky), bandLeft, 0, bandRight, 0);
    glowAlong(ctx, skyStops(sky), [bandLeft, bandY], [bandRight, bandY], 8, 4, 0.8);
    ctx.beginPath();
    ctx.roundRect(bandLeft, bandY - 2, bandRight - bandLeft, 4, 2);
    ctx.fillStyle = fill;
    ctx.fill();
    for (const event of sky.events) sunDot(ctx, bandLeft + (bandRight - bandLeft) * (event.minute / Math.max(1, flight.durationMinutes)), bandY, 2, 3);
  }
  text(ctx, formatDuration(flight.durationMinutes, locale), (bandLeft + bandRight) / 2, bandY + 6 + 7 + ascent(8.5), 8.5, 500, 0.62, "center");

  const codesBottom = ends + lineHeight(32) + 3 + lineHeight(9) + 3 + lineHeight(11);
  const words = sky ? describeSky(sky, locale) : null;
  if (words) {
    font(ctx, 9, 500);
    const room = CARD.width - CARD.margin * 2;
    const lines: string[] = [];
    let current = "";
    for (const piece of locale === "en" ? words.split(/(?<= )/) : [...words]) {
      if (current && ctx.measureText(current + piece).width > room) { lines.push(current.trimEnd()); current = piece.trimStart(); } else current += piece;
    }
    if (current) lines.push(current);
    lines.slice(0, 2).forEach((line, index) => text(ctx, line, CARD.margin, codesBottom + 10 + ascent(9) + index * lineHeight(9), 9, 500, 0.78));
  }

  // The aircraft, just above the footer.
  const footerTop = FOOTER_BASELINE - ascent(6.5);
  const aircraft = flight.aircraft;
  if (aircraft?.model) {
    const rowBottom = footerTop - 12;
    const center = rowBottom - 14;
    const drawn = aircraftProfile(ctx, aircraft.icao, CARD.margin, center, 86);
    const textX = CARD.margin + (drawn ? 98 : 0);
    const extra = [aircraft.registration, flight.seat ? [flight.seat, flight.cabin && CABINS[flight.cabin] ? t(locale, ...CABINS[flight.cabin]) : null].filter(Boolean).join(" · ") : null].filter((item): item is string => !!item);
    const model = localModel(aircraft.model, locale);
    if (extra.length) {
      text(ctx, model, textX, center - 1.5, 9.5, 600, 0.92);
      text(ctx, extra.join(" · "), textX, center + 2 + ascent(8), 8, 500, 0.62);
    } else {
      text(ctx, model, textX, center + 3.4, 9.5, 600, 0.92);
    }
  }
  footer(ctx, t(locale, "线的颜色是沿途窗外的天色", "線的顏色是沿途窗外的天色", "The line is the colour of the sky outside, all the way"));
}

// MARK: Printing

export async function printCard(request: CardRequest, context: CardContext): Promise<Blob> {
  await Promise.all([document.fonts?.ready, loadWorld()]);
  family = getComputedStyle(document.body).fontFamily || family;
  const canvas = document.createElement("canvas");
  canvas.width = CARD.width * CARD.scale;
  canvas.height = CARD.height * CARD.scale;
  const ctx = canvas.getContext("2d") as Ctx;
  ctx.scale(CARD.scale, CARD.scale);
  if (request.kind === "year") await yearCard(ctx, request, context);
  else if (request.kind === "trip") await tripCard(ctx, request.trip, context);
  else await flightCard(ctx, request.flight, request.ordinal, context);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    canvas.width = canvas.height = 0;
    if (blob) resolve(blob); else reject(new Error("card"));
  }, "image/jpeg", 0.92));
}

// Named for what it shows, so it reads right in Files, AirDrop or a chat.
export function cardName(request: CardRequest, locale: Locale) {
  const brand = brandName[locale];
  const subject = request.kind === "year"
    ? request.year === null ? t(locale, "全部年份", "全部年份", "All years") : String(request.year)
    : request.kind === "trip"
      ? `${cardTitle(request.trip, locale)} ${request.trip.start.slice(0, 7)}`
      : `${request.flight.flight || `${request.flight.origin}-${request.flight.destination}`} ${request.flight.date}`;
  return `${brand} ${subject}`.replace(/[/:\\]/g, "-");
}
