import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { geoOrthographic, geoPath, geoGraticule10 } from "d3-geo";
import { feature } from "topojson-client";
import { markSvg } from "../app/lib/mark.mjs";

const root = resolve(import.meta.dirname, "..");
const topology = JSON.parse(await readFile(resolve(root, "node_modules/world-atlas/countries-110m.json"), "utf8"));
const projection = geoOrthographic().rotate([-83, -19, -12]).translate([1055, 370]).scale(254);
const path = geoPath(projection);
const sphere = path({ type: "Sphere" });
const countries = path(feature(topology, topology.objects.countries));
const graticule = path(geoGraticule10());
const PVG = [121.805, 31.143], AMS = [4.764, 52.308], NRT = [140.386, 35.765], BKK = [100.747, 13.69], CTU = [103.947, 30.578], SYX = [109.412, 18.303];
// The sample travellers' routes (app/data/flights.example.json), not anyone's own.
const routes = [
  [PVG, AMS, "#b8acf0"],
  [PVG, NRT, "#8bc9df"],
  [PVG, BKK, "#8bc9df"],
  [PVG, CTU, "#8bc9df"],
  [AMS, BKK, "#e7edf4"],
  [PVG, SYX, "#8bc9df"],
].map(([origin, destination, color]) => `<path d="${path({ type: "LineString", coordinates: [origin, destination] })}" stroke="${color}" stroke-width="1.7" fill="none" opacity=".85"/>`).join("");
const airports = [
  ["PVG", PVG, 10, 19], ["AMS", AMS, 12, 17],
  ["NRT", NRT, 9, -12], ["BKK", BKK, -36, 20],
  ["CTU", CTU, -38, -10], ["SYX", SYX, 10, 18],
].map(([code, coordinates, dx, dy]) => {
  const [x, y] = projection(coordinates);
  return `<circle cx="${x}" cy="${y}" r="4" fill="#dceaf2"/><circle cx="${x}" cy="${y}" r="10" fill="none" stroke="#8bc9df" opacity=".3"/><text x="${x + dx}" y="${y + dy}" fill="#b7c4d3" font-size="13" font-family="monospace">${code}</text>`;
}).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="720" viewBox="0 0 1440 720" role="img" aria-labelledby="title desc">
<title id="title">航迹 Flyprint</title><desc id="desc">将每一次飞行，连成你的世界。地球上示例旅客的航线与机场标记。</desc>
<defs><radialGradient id="ocean" cx="35%" cy="30%"><stop stop-color="#152433"/><stop offset="1" stop-color="#0d151f"/></radialGradient><clipPath id="globe"><path d="${sphere}"/></clipPath><linearGradient id="edge"><stop stop-color="#8bc9df" stop-opacity=".55"/><stop offset="1" stop-color="#8bc9df" stop-opacity=".05"/></linearGradient></defs>
<rect width="1440" height="720" fill="#0b1016"/>
<path d="M54 112H1386M54 640H1386" stroke="#283340"/>
<g transform="translate(54 50) scale(0.82)">${markSvg("mark")}</g>
<text x="106" y="78" fill="#e8edf2" font-family="Arial,'PingFang SC','Microsoft YaHei',sans-serif" font-size="19" font-weight="600" letter-spacing="1">航迹</text>
<text x="1386" y="77" text-anchor="end" fill="#8494a8" font-family="monospace" font-size="12" letter-spacing="1.5">FLIGHT JOURNAL / OPEN SOURCE</text>
<g clip-path="url(#globe)"><path d="${sphere}" fill="url(#ocean)"/><path d="${countries}" fill="#233143" stroke="#415369" stroke-width=".55"/><path d="${graticule}" fill="none" stroke="#52647a" stroke-width=".45" opacity=".35"/>${routes}${airports}</g>
<path d="${sphere}" fill="none" stroke="url(#edge)" stroke-width="1.2"/>
<circle cx="1055" cy="370" r="270" fill="none" stroke="#536a83" stroke-dasharray="2 8" opacity=".3"/>
<text x="54" y="224" fill="#8bc9df" font-family="monospace" font-size="13" letter-spacing="4">A PERSONAL FLIGHT ATLAS</text>
<text x="49" y="339" fill="#eef3f8" font-family="Arial,Helvetica,sans-serif" font-size="112" font-weight="700" letter-spacing="-4">Flyprint</text>
<text x="56" y="402" fill="#e8edf2" font-family="Arial,'PingFang SC','Microsoft YaHei',sans-serif" font-size="27" letter-spacing="2">将每一次飞行，连成你的世界。</text>
<text x="57" y="455" fill="#99a8bb" font-family="Arial,'PingFang SC','Microsoft YaHei',sans-serif" font-size="17">交互地球 · 航线回放 · 年度图鉴 · 同行档案</text>
<g font-family="monospace" font-size="12" fill="#c0cddc"><path d="M57 532H393" stroke="#344353"/><circle cx="61" cy="532" r="3.5" fill="#8bc9df"/><circle cx="226" cy="532" r="3.5" fill="#b8acf0"/><circle cx="393" cy="532" r="3.5" fill="#e8edf2"/><text x="57" y="563">EXPLORE</text><text x="208" y="563">REPLAY</text><text x="342" y="563">REMEMBER</text></g>
<text x="54" y="681" fill="#8494a8" font-family="monospace" font-size="11" letter-spacing="1.3">SELF-HOSTED · REACT · MAPLIBRE · SQLITE</text>
<text x="1386" y="681" text-anchor="end" fill="#8494a8" font-family="monospace" font-size="11" letter-spacing="1.3">SAMPLE TRAVELLERS / REAL GEOGRAPHY</text>
</svg>\n`;
await mkdir(resolve(root, "docs/assets"), { recursive: true });
await writeFile(resolve(root, "docs/assets/hero.svg"), svg);
console.log("README vector hero generated from public reference geometry.");
