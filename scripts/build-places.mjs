// Builds Chinese names for every airport in the gazetteer: the city it serves
// and the airport itself, in simplified and traditional script.
//
//   node scripts/build-places.mjs            build from the cache in work/places
//   node scripts/build-places.mjs --fetch    refresh the cache first (network)
//
// Source: Wikidata labels of each airport (P238, its IATA code) and of the
// place it serves (P931). Hand-checked names in names.json, if any, win at
// run time (gazetteer.ts).
// Output, committed: app/lib/server/places.json { IATA: [cityHans, cityHant, nameHans, nameHant] }
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as OpenCC from "opencc-js";

const root = resolve(import.meta.dirname, "..");
const cache = join(root, "work/places");
const LANGS = `"en","zh-hans","zh-cn","zh-hant","zh-hk","zh-tw","zh"`;
const QUERIES = {
  airports: `SELECT ?item ?iata ?city ?closed ?label WHERE {
    ?item wdt:P238 ?iata .
    OPTIONAL { ?item wdt:P3999 ?closed }
    OPTIONAL { ?item wdt:P931 ?city }
    OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) IN (${LANGS})) }
  }`,
  cities: `SELECT ?city ?label WHERE {
    ?item wdt:P238 ?iata ; wdt:P931 ?city .
    ?city rdfs:label ?label FILTER(LANG(?label) IN (${LANGS}))
  }`,
};

const toHans = OpenCC.Converter({ from: "hk", to: "cn" });
const toHant = OpenCC.Converter({ from: "cn", to: "hk" });
const twToHk = OpenCC.Converter({ from: "tw", to: "hk" });
const han = (text) => /[㐀-鿿]/.test(text ?? "");

if (process.argv.includes("--fetch") || !existsSync(join(cache, "airports.json"))) {
  await mkdir(cache, { recursive: true });
  for (const [name, query] of Object.entries(QUERIES)) {
    const response = await fetch(`https://query.wikidata.org/sparql?${new URLSearchParams({ query, format: "json" })}`, {
      headers: { accept: "application/sparql-results+json", "user-agent": "flyprint-data-build/1.0" },
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`Wikidata ${name}: ${response.status}`);
    await writeFile(join(cache, `${name}.json`), Buffer.from(await response.arrayBuffer()));
  }
}

const read = (name) => JSON.parse(readFileSync(join(cache, `${name}.json`))).results.bindings;
const gazetteer = JSON.parse(readFileSync(join(root, "app/lib/server/airports.json")));

const labels = new Map();
for (const row of read("cities")) {
  const city = labels.get(row.city.value) ?? {};
  city[row.label["xml:lang"]] ??= row.label.value;
  labels.set(row.city.value, city);
}
// Cities by English name, for airports whose own item names a district or a
// metro area rather than the city the gazetteer gives.
const byEnglish = new Map();
const plain = (text) => text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
for (const city of labels.values()) if (city.en && !byEnglish.has(plain(city.en))) byEnglish.set(plain(city.en), city);

const items = new Map();
for (const row of read("airports")) {
  const item = items.get(row.item.value) ?? { iata: row.iata.value.trim().toUpperCase(), labels: {}, cities: new Set(), closed: false };
  if (row.closed) item.closed = true;
  if (row.city) item.cities.add(row.city.value);
  if (row.label) item.labels[row.label["xml:lang"]] ??= row.label.value;
  items.set(row.item.value, item);
}
const byCode = new Map();
for (const item of items.values()) byCode.set(item.iata, [...(byCode.get(item.iata) ?? []), item]);

const words = (text) => new Set((text ?? "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter((word) => word.length > 2 && !["airport", "international", "regional", "municipal", "air", "base", "field"].includes(word)));
const likeness = (a, b) => { const x = words(a), y = words(b); let shared = 0; for (const word of x) if (y.has(word)) shared++; return shared / Math.max(1, Math.min(x.size, y.size)); };

// Simplified from any label, traditional from the Hong Kong, then Taiwan
// label in Hong Kong characters, else converted from the simplified one.
function scripts(set, english) {
  const simplified = [set["zh-hans"], set["zh-cn"], set.zh, set["zh-hk"], set["zh-hant"], set["zh-tw"]].find(han);
  if (!simplified) return null;
  const hans = toHans(simplified);
  const traditional = set["zh-hk"] ?? set["zh-hant"] ?? (set["zh-tw"] && twToHk(set["zh-tw"]));
  const hant = han(traditional) ? toHant(traditional) : toHant(hans);
  return [tidyCity(hans, english), tidyCity(hant, english)];
}

// "上海市" reads as "上海"; "胡志明市" keeps its 市, as "Ho Chi Minh City" keeps City.
const WHOLE = new Set(["三藩市", "胡志明市"]);
function tidyCity(name, english = "") {
  let value = name.replace(/\s*\(.*?\)|（.*?）/gu, "").trim();
  if (/^(东京都|東京都)$/u.test(value)) return value.slice(0, 2);
  if (WHOLE.has(value)) return value;
  value = value.replace(/(大都市区|大都市區|大都会区|大都會區|都会区|都會區|大都会|大都會)$/u, "");
  if (/[市府]$/u.test(value) && value.length >= 3 && !/\bcity$/i.test(english)) value = value.slice(0, -1);
  return value;
}

// The place travellers name for these airports, where Wikidata gives a district,
// a neighbouring town or a province.
const CITIES = {
  KEF: ["雷克雅未克", "雷克雅未克"], CEB: ["宿务", "宿霧"], MRU: ["毛里求斯", "毛里裘斯"], USM: ["苏梅岛", "蘇梅島"],
  PMI: ["帕尔马", "帕爾馬"], SEZ: ["塞舌尔", "塞舌爾"], MNL: ["马尼拉", "馬尼拉"], CNX: ["清迈", "清邁"], ZNZ: ["桑给巴尔", "桑給巴爾"],
  DFW: ["达拉斯", "達拉斯"], ORD: ["芝加哥", "芝加哥"], MDW: ["芝加哥", "芝加哥"], NRT: ["东京", "東京"], CTS: ["札幌", "札幌"],
  HKT: ["普吉岛", "布吉"], DPS: ["巴厘岛", "峇里"], LGK: ["兰卡威", "蘭卡威"], BKI: ["亚庇", "亞庇"], PEN: ["槟城", "檳城"],
  REP: ["暹粒", "暹粒"], SAI: ["暹粒", "暹粒"], PQC: ["富国岛", "富國島"], CXR: ["芽庄", "芽莊"], DAD: ["岘港", "峴港"],
  OKA: ["冲绳", "沖繩"], CJU: ["济州岛", "濟州島"], BHY: ["北海", "北海"], SYX: ["三亚", "三亞"], JHG: ["西双版纳", "西雙版納"],
  LJG: ["丽江", "麗江"], DLU: ["大理", "大理"], TFU: ["成都", "成都"], PKX: ["北京", "北京"], MLE: ["马尔代夫", "馬爾代夫"],
  NAN: ["斐济", "斐濟"], PPT: ["大溪地", "大溪地"], BOB: ["波拉波拉岛", "波拉波拉島"], TFS: ["特内里费", "特內里費"],
  JTR: ["圣托里尼", "聖托里尼"], JMK: ["米科诺斯", "米科諾斯"], IBZ: ["伊维萨岛", "伊維薩島"], OGG: ["毛伊岛", "茂宜島"],
  KOA: ["夏威夷大岛", "夏威夷大島"], EWR: ["纽约", "紐約"], LGA: ["纽约", "紐約"], BWI: ["巴尔的摩", "巴爾的摩"],
  STN: ["伦敦", "倫敦"], LTN: ["伦敦", "倫敦"], LCY: ["伦敦", "倫敦"], BVA: ["巴黎", "巴黎"], CRL: ["布鲁塞尔", "布魯塞爾"],
};
const out = {};
let named = 0, cityOnly = 0;
for (const [code, row] of Object.entries(gazetteer)) {
  const [, , , , city, name] = row;
  const candidates = (byCode.get(code) ?? []).filter((item) => !item.closed);
  if (!candidates.length) continue;
  const item = candidates.sort((a, b) => likeness(b.labels.en, name) - likeness(a.labels.en, name) || b.cities.size - a.cities.size)[0];
  const served = [...item.cities].map((id) => labels.get(id)).filter(Boolean);
  const cityLabels = served.find((set) => set.en && city && likeness(set.en, city) > 0.5) ?? (city && byEnglish.get(plain(city))) ?? served[0];
  const cityNames = CITIES[code] ?? (cityLabels ? scripts(cityLabels, cityLabels.en ?? city) : null);
  const airportNames = scripts(item.labels, "");
  if (!cityNames && !airportNames) continue;
  out[code] = [cityNames?.[0] ?? "", cityNames?.[1] ?? "", airportNames?.[0] ?? "", airportNames?.[1] ?? ""];
  if (cityNames) named++; else cityOnly++;
}
await writeFile(join(root, "app/lib/server/places.json"), `${JSON.stringify(out)}\n`);
console.log(`${Object.keys(out).length} airports: ${named} with city names, ${cityOnly} with airport names only`);
