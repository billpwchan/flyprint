// Draws the app icon (the mark on its night tile) and writes every size the
// site serves: public/favicon.svg and public/icons/*.png.
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { contrail } from "../app/lib/mark.mjs";

// On a 64-unit tile: the earth's limb low in the frame, an older short hop,
// and the latest flight leaving home (the warm point) for the far side.
const limbY = (x) => 116 - Math.sqrt(64 ** 2 - (x - 32) ** 2);
const home = [10, limbY(10)], away = [54, limbY(54)];
const trail = contrail(home, [31, -2], away, 0.5, 3.4, 64);
const hop = `M21 ${limbY(21).toFixed(2)}Q30 30 40 ${limbY(40).toFixed(2)}`;

function tile({ radius, inset = 0 }) {
  const art = `<circle cx="32" cy="116" r="64" fill="url(#earth)"/><circle cx="32" cy="116" r="64" fill="none" stroke="#8fb6e6" stroke-opacity=".45" stroke-width=".7"/><circle cx="32" cy="116" r="65.6" fill="none" stroke="#8fb6e6" stroke-opacity=".14" stroke-width="2.6" filter="url(#glow)"/>
<path d="${hop}" fill="none" stroke="#c9dbf0" stroke-opacity=".3" stroke-width=".9" stroke-linecap="round"/>
<path d="${trail}" fill="#a9c8ee" opacity=".5" filter="url(#glow)"/><path d="${trail}" fill="url(#trail)"/>
<circle cx="${home[0]}" cy="${home[1].toFixed(2)}" r="2.6" fill="#f3cf7f"/><circle cx="${away[0]}" cy="${away[1].toFixed(2)}" r="1.9" fill="#fff"/>`;
  // A maskable icon keeps its drawing inside the central safe circle.
  const scale = 1 - inset * 2, shift = 32 * inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="bg" cx="0.5" cy="0.12" r="1"><stop offset="0" stop-color="#131a23"/><stop offset="1" stop-color="#06080a"/></radialGradient><radialGradient id="earth" cx="0.5" cy="0" r="0.8"><stop offset="0" stop-color="#1e2a39"/><stop offset="1" stop-color="#0c1117"/></radialGradient><linearGradient id="trail" x1="0" x2="1"><stop offset="0" stop-color="#eef2f6" stop-opacity=".2"/><stop offset=".55" stop-color="#eef2f6" stop-opacity=".88"/><stop offset="1" stop-color="#fff"/></linearGradient><filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.3"/></filter><clipPath id="tile"><rect width="64" height="64" rx="${radius}"/></clipPath></defs><rect width="64" height="64" rx="${radius}" fill="url(#bg)"/><g clip-path="url(#tile)"><g transform="translate(${shift / 2} ${shift / 2}) scale(${scale})">${art}</g></g></svg>`;
}

const png = (svg, size, file) => sharp(Buffer.from(svg), { density: 72 * Math.ceil(size / 64) * 4 }).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
mkdirSync("public/icons", { recursive: true });
writeFileSync("public/favicon.svg", tile({ radius: 14.2 }));
// Home screens round the corners themselves, so these fill the square.
await png(tile({ radius: 0 }), 180, "public/icons/apple-touch-icon.png");
await png(tile({ radius: 0 }), 192, "public/icons/icon-192.png");
await png(tile({ radius: 0 }), 512, "public/icons/icon-512.png");
await png(tile({ radius: 0, inset: 0.12 }), 512, "public/icons/icon-maskable-512.png");
// The iOS app's single 1024 icon; the App Store refuses transparency.
const iconSet = "ios/Flyprint/Resources/Assets.xcassets/AppIcon.appiconset";
mkdirSync(iconSet, { recursive: true });
await sharp(Buffer.from(tile({ radius: 0 })), { density: 72 * 16 * 4 }).resize(1024, 1024).flatten({ background: "#06080a" }).png({ compressionLevel: 9 }).toFile(`${iconSet}/icon-1024.png`);
