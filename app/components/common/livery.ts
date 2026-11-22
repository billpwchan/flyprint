"use client";

import { useEffect, useState } from "react";
import { carrierAssets } from "../../lib/data";

// An airline's colour, read off its mark the way the app reads it (Theme.swift,
// Livery): the mark drawn at 24 px, each inked pixel weighted by how saturated
// and bright it is, so the red of a tail wins over a black wordmark.
const known = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function measure(code: string): Promise<string | null> {
  if (known.has(code)) return Promise.resolve(known.get(code)!);
  let job = pending.get(code);
  if (job) return job;
  job = new Promise<string | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const side = 24;
        const canvas = document.createElement("canvas");
        canvas.width = side;
        canvas.height = side;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0, side, side);
        const pixels = context.getImageData(0, 0, side, side).data;
        let r = 0, g = 0, b = 0, weight = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const a = pixels[i + 3] / 255;
          if (a <= 0.5) continue;
          const c = [pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255];
          const max = Math.max(...c), min = Math.min(...c);
          const saturation = (max - min) / Math.max(0.001, max);
          const w = a * saturation * saturation * max;
          r += c[0] * w; g += c[1] * w; b += c[2] * w;
          weight += w;
        }
        resolve(weight > 2 ? `rgb(${Math.round((r / weight) * 255)}, ${Math.round((g / weight) * 255)}, ${Math.round((b / weight) * 255)})` : null);
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = `/airlines/${code}.webp`;
  }).then((color) => {
    known.set(code, color);
    pending.delete(code);
    return color;
  });
  pending.set(code, job);
  return job;
}

export function useLivery(code: string | undefined) {
  const [color, setColor] = useState<string | null>(() => code ? known.get(code) ?? null : null);
  useEffect(() => {
    if (!code || !carrierAssets.has(code)) return;
    let live = true;
    measure(code).then((found) => { if (live) setColor(found); });
    return () => { live = false; };
  }, [code]);
  return code && carrierAssets.has(code) ? color : null;
}
