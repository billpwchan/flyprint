import sharp from "sharp";

// A mark trimmed to its ink, centred in a square, and lifted where it would
// vanish into the night-side globe.
export const SIZE = 144, INK = 128;
export async function normalise(input, density) {
  const base = sharp(input, density ? { density } : {}).ensureAlpha();
  const trimmed = await base.trim({ threshold: 1 }).png().toBuffer().catch(() => base.png().toBuffer());
  const { data, info } = await sharp(trimmed).resize(INK, INK, { fit: "inside", withoutEnlargement: false }).raw().toBuffer({ resolveWithObject: true });
  // Ink darker than about L* 35 vanishes on the night globe. When most of a
  // mark is that dark it keeps its hue and saturation and gains lightness,
  // the way airlines draw their marks for dark backgrounds.
  const lightness = (r, g, b) => (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
  let ink = 0, dark = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 128) continue;
    ink++;
    const [r, g, b] = [data[index], data[index + 1], data[index + 2]].map((value) => { const v = value / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    if (0.2126 * r + 0.7152 * g + 0.0722 * b < 0.085) dark++;
  }
  if (ink && dark / ink > 0.5) {
    for (let index = 0; index < data.length; index += 4) {
      const [r, g, b] = [data[index], data[index + 1], data[index + 2]];
      const light = lightness(r, g, b);
      if (light >= 0.55) continue;
      const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, chroma = max - min;
      const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * light - 1));
      const hue = chroma === 0 ? 0 : max === r / 255 ? ((g - b) / 255 / chroma + 6) % 6 : max === g / 255 ? (b - r) / 255 / chroma + 2 : (r - g) / 255 / chroma + 4;
      const lifted = 0.58 + light * 0.4;
      const c = (1 - Math.abs(2 * lifted - 1)) * Math.min(1, saturation), x = c * (1 - Math.abs((hue % 2) - 1)), m = lifted - c / 2;
      const [r1, g1, b1] = hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x] : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x];
      [data[index], data[index + 1], data[index + 2]] = [r1, g1, b1].map((value) => Math.round((value + m) * 255));
    }
  }
  return sharp(data, { raw: info })
    .extend({ top: Math.floor((SIZE - info.height) / 2), bottom: Math.ceil((SIZE - info.height) / 2), left: Math.floor((SIZE - info.width) / 2), right: Math.ceil((SIZE - info.width) / 2), background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90, alphaQuality: 100, effort: 4 })
    .toBuffer();
}

// The public source of a mark in the build cache, best first: an SVG from
// Soaring Symbols, then the KAYAK and Google Flights icons.
export function sourceOf(dir, code, exists) {
  if (exists(`${dir}/${code}.svg`)) return [`${dir}/${code}.svg`, 600];
  if (exists(`${dir}/${code}.kayak.png`)) return [`${dir}/${code}.kayak.png`];
  if (exists(`${dir}/${code}.google.png`)) return [`${dir}/${code}.google.png`];
  return null;
}
