// Each country's own outline for the iOS app and the site, so countries can be
// shown as their shapes rather than flags: ios/Flyprint/Resources/countries.json
// and public/countries.json.
// Every outline is drawn on an equal-area projection centred on the country,
// fitted to a 100-unit box; far-flung territories are left out so the
// shape reads as the country people picture. The projection is kept beside
// the outline so the app can place a city on it.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { geoAzimuthalEqualArea, geoCentroid, geoCircle, geoDistance, geoArea, geoPath, geoStream } from "d3-geo";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const atlas = JSON.parse(require("node:fs").readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"));
// Small places (Hong Kong, Macau, Singapore, Malta) come from the finest atlas,
// where the coarse one has them as a few straight cuts.
const fine = JSON.parse(require("node:fs").readFileSync(require.resolve("world-atlas/countries-10m.json"), "utf8"));
const fineById = new Map(feature(fine, fine.objects.countries).features.map((country) => [country.id ?? country.properties.name, country]));
const SMALL = 30000 / 6371 ** 2;
// A few fine polygons wind the wrong way, which d3 reads as the whole globe
// minus the island.
function rewound(shape) {
  const fix = (rings) => (geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI ? rings.map((ring) => [...ring].reverse()) : rings);
  if (shape.type === "Polygon") return { ...shape, coordinates: fix(shape.coordinates) };
  if (shape.type === "MultiPolygon") return { ...shape, coordinates: shape.coordinates.map(fix) };
  return shape;
}
const landAtlas = JSON.parse(require("node:fs").readFileSync(require.resolve("world-atlas/land-50m.json"), "utf8"));
const land = feature(landAtlas, landAtlas.objects.land);

// ISO 3166 numeric to alpha-2, read once from the system ICU (uregion_getRegionFromNumericCode).
const ALPHA2 = {"004":"AF","008":"AL","010":"AQ","012":"DZ","016":"AS","020":"AD","024":"AO","028":"AG","031":"AZ","032":"AR","036":"AU","040":"AT","044":"BS","048":"BH","050":"BD","051":"AM","052":"BB","056":"BE","060":"BM","064":"BT","068":"BO","070":"BA","072":"BW","076":"BR","084":"BZ","086":"IO","090":"SB","092":"VG","096":"BN","100":"BG","104":"MM","108":"BI","112":"BY","116":"KH","120":"CM","124":"CA","132":"CV","136":"KY","140":"CF","144":"LK","148":"TD","152":"CL","156":"CN","158":"TW","170":"CO","174":"KM","178":"CG","180":"CD","184":"CK","188":"CR","191":"HR","192":"CU","196":"CY","203":"CZ","204":"BJ","208":"DK","212":"DM","214":"DO","218":"EC","222":"SV","226":"GQ","231":"ET","232":"ER","233":"EE","234":"FO","238":"FK","239":"GS","242":"FJ","246":"FI","248":"AX","250":"FR","258":"PF","260":"TF","262":"DJ","266":"GA","268":"GE","270":"GM","275":"PS","276":"DE","288":"GH","296":"KI","300":"GR","304":"GL","308":"GD","316":"GU","320":"GT","324":"GN","328":"GY","332":"HT","334":"HM","336":"VA","340":"HN","344":"HK","348":"HU","352":"IS","356":"IN","360":"ID","364":"IR","368":"IQ","372":"IE","376":"IL","380":"IT","384":"CI","388":"JM","392":"JP","398":"KZ","400":"JO","404":"KE","408":"KP","410":"KR","414":"KW","417":"KG","418":"LA","422":"LB","426":"LS","428":"LV","430":"LR","434":"LY","438":"LI","440":"LT","442":"LU","446":"MO","450":"MG","454":"MW","458":"MY","462":"MV","466":"ML","470":"MT","478":"MR","480":"MU","484":"MX","492":"MC","496":"MN","498":"MD","499":"ME","500":"MS","504":"MA","508":"MZ","512":"OM","516":"NA","520":"NR","524":"NP","528":"NL","531":"CW","533":"AW","534":"SX","540":"NC","548":"VU","554":"NZ","558":"NI","562":"NE","566":"NG","570":"NU","574":"NF","578":"NO","580":"MP","583":"FM","584":"MH","585":"PW","586":"PK","591":"PA","598":"PG","600":"PY","604":"PE","608":"PH","612":"PN","616":"PL","620":"PT","624":"GW","626":"TL","630":"PR","634":"QA","642":"RO","643":"RU","646":"RW","652":"BL","654":"SH","659":"KN","660":"AI","662":"LC","663":"MF","666":"PM","670":"VC","674":"SM","678":"ST","682":"SA","686":"SN","688":"RS","690":"SC","694":"SL","702":"SG","703":"SK","704":"VN","705":"SI","706":"SO","710":"ZA","716":"ZW","724":"ES","728":"SS","729":"SD","732":"EH","740":"SR","748":"SZ","752":"SE","756":"CH","760":"SY","762":"TJ","764":"TH","768":"TG","776":"TO","780":"TT","784":"AE","788":"TN","792":"TR","795":"TM","796":"TC","800":"UG","804":"UA","807":"MK","818":"EG","826":"GB","831":"GG","832":"JE","833":"IM","834":"TZ","840":"US","850":"VI","854":"BF","858":"UY","860":"UZ","862":"VE","876":"WF","882":"WS","887":"YE","894":"ZM"};
const BY_NAME = { Kosovo: "XK" };

const SIZE = 100;
// Drawn at most a few hundred points wide: drop points closer than half a unit
// to the last one kept, and rings too small to see.
function simplify(d) {
  return d.split("Z").filter(Boolean).map((ring) => {
    const points = ring.replace(/^M/, "").split("L").map((pair) => pair.split(",").map(Number));
    const kept = [];
    for (const [x, y] of points) {
      const last = kept[kept.length - 1];
      if (!last || Math.hypot(x - last[0], y - last[1]) >= 0.5) kept.push([x, y]);
    }
    const xs = kept.map((p) => p[0]), ys = kept.map((p) => p[1]);
    if (kept.length < 3 || Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) < 1.2) return "";
    return "M" + kept.map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join("L") + "Z";
  }).join("");
}
// A country of scattered islands (the Maldives, Fiji, the Bahamas) covers too
// little of its own box to read as a shape. It is drawn instead the way an
// atlas places one: in a disc of the sea around it, the coasts nearby faint
// (around), its islands lit, and a ring round them.
const SPARSE = 0.06;
function locator(local, lon, lat) {
  let extent = 0;
  geoStream(local, { point(x, y) { extent = Math.max(extent, geoDistance([lon, lat], [x, y])); }, lineStart() {}, lineEnd() {}, polygonStart() {}, polygonEnd() {}, sphere() {} });
  const radius = Math.max(extent * 1.8, 0.16) * 180 / Math.PI;
  const disc = geoCircle().center([lon, lat]).radius(radius)();
  const view = geoAzimuthalEqualArea().rotate([-lon, -lat]).fitSize([SIZE, SIZE], disc).clipAngle(radius).precision(0.2);
  const [[x0, y0], [x1, y1]] = geoPath(view).bounds(local);
  const ring = [(x0 + x1) / 2, (y0 + y1) / 2, Math.max(Math.hypot(x1 - x0, y1 - y0) / 2 + 6, 14)];
  return {
    center: [Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000],
    scale: Math.round(view.scale() * 1000) / 1000,
    translate: view.translate().map((v) => Math.round(v * 1000) / 1000),
    box: [0, 0, SIZE, SIZE],
    d: geoPath(view)(local),
    around: simplify(geoPath(view)(land) ?? ""),
    ring: ring.map((v) => Math.round(v * 10) / 10),
  };
}
const out = {};
const sizes = {};
for (const country of feature(atlas, atlas.objects.countries).features) {
  const iso = ALPHA2[country.id] ?? BY_NAME[country.properties.name];
  if (!iso || iso === "AQ") continue;
  // Two features can share a code (Australia and the Ashmore and Cartier
  // Islands are both 036): the larger is the country.
  if ((sizes[iso] ?? 0) > geoArea(country)) continue;
  sizes[iso] = geoArea(country);
  // Keep the polygons near the largest one: mainland France without Guiana and Réunion.
  let shape = country.geometry;
  if (geoArea(shape) < SMALL) shape = rewound(fineById.get(country.id ?? country.properties.name)?.geometry ?? shape);
  if (shape.type === "MultiPolygon") {
    const parts = shape.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }));
    const main = parts.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
    const center = geoCentroid(main);
    // Beyond the main polygon's own reach, only islands of some size: Crete
    // stays with Greece, Madeira does not shrink Portugal to a sliver. A part
    // nearly as big as the main one is the country too (both halves of Malaysia).
    const reach = Math.sqrt(geoArea(main)) * 2.2;
    const kept = (part) => {
      const distance = geoDistance(geoCentroid(part), center);
      const share = geoArea(part) / geoArea(main);
      return distance < reach || (distance < 0.2 && share > 0.015) || (distance < 0.5 && share > 0.2);
    };
    shape = { type: "MultiPolygon", coordinates: parts.filter(kept).map((part) => part.coordinates) };
  }
  const local = { type: "Feature", properties: {}, geometry: shape };
  const [lon, lat] = geoCentroid(local);
  const projection = geoAzimuthalEqualArea().rotate([-lon, -lat]).fitSize([SIZE, SIZE], local).precision(0.2);
  const d = geoPath(projection)(local);
  if (!d) continue;
  const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(local);
  const cover = geoPath(projection).area(local) / Math.max(1, (x1 - x0) * (y1 - y0));
  out[iso] = cover < SPARSE ? locator(local, lon, lat) : {
    center: [Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000],
    scale: Math.round(projection.scale() * 1000) / 1000,
    translate: projection.translate().map((v) => Math.round(v * 1000) / 1000),
    box: [x0, y0, x1, y1].map((v) => Math.round(v * 10) / 10),
    d: simplify(d) || d,
  };
}
// The web draws the same marks from the same file.
for (const target of ["ios/Flyprint/Resources/countries.json", "public/countries.json"]) writeFileSync(resolve(root, target), JSON.stringify(out));
console.log(Object.keys(out).length, "countries");
