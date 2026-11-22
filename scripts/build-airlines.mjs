// Builds the airline catalogue: a name in each interface language and a mark
// for every airline that sells tickets today.
//
//   node scripts/build-airlines.mjs            build from the cache in work/airlines
//   node scripts/build-airlines.mjs --fetch    refresh the cache first (network)
//
// Sources, cached under work/airlines/ (never committed):
// - Travelpayouts airline lists: which codes are flying now, English names.
// - Wikidata labels: Chinese names, matched to a code by IATA and English name.
// - Soaring Symbols icons (SVG), then Kayak's square marks, then Google's.
// Outputs, committed:
// - app/lib/server/carriers.json   { names: { IATA: [hans, hant, en] }, icao: { ICAO: IATA } }
// - app/lib/carrier-marks.json     every IATA code with a mark
// - public/airlines/<IATA>.webp    the marks, trimmed, centred, legible on the dark globe
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { normalise, sourceOf } from "./airline-mark.mjs";
import * as OpenCC from "opencc-js";

const root = resolve(import.meta.dirname, "..");
const cache = join(root, "work/airlines");
const out = join(root, "public/airlines");
// Codes since reassigned to another airline: their current mark would put the
// new airline on flights of the one these names describe.
const REASSIGNED = new Set(["KA"]);
const fetchFirst = process.argv.includes("--fetch");
const AGENT = "flyprint-data-build/1.0";

const toHans = OpenCC.Converter({ from: "hk", to: "cn" });
const toHant = OpenCC.Converter({ from: "cn", to: "hk" });

// Names checked by hand: what Chinese-speaking travellers call these airlines.
// Codes here win over every source.
const NAMES = {
  KA: ["国泰港龙航空", "國泰港龍航空", "Cathay Dragon"],
  VN: ["越南航空", "越南航空", "Vietnam Airlines"],
  KE: ["大韩航空", "大韓航空", "Korean Air"],
  NH: ["全日空", "全日空", "ANA"],
  JL: ["日本航空", "日本航空", "Japan Airlines"],
  OZ: ["韩亚航空", "韓亞航空", "Asiana Airlines"],
  FJ: ["斐济航空", "斐濟航空", "Fiji Airways"],
  AM: ["墨西哥国际航空", "墨西哥國際航空", "Aeroméxico"],
  NK: ["精神航空", "精神航空", "Spirit Airlines"],
  AA: ["美国航空", "美國航空", "American Airlines"],
  QF: ["澳洲航空", "澳洲航空", "Qantas"],
  JQ: ["捷星航空", "捷星航空", "Jetstar"],
  "3K": ["捷星亚洲航空", "捷星亞洲航空", "Jetstar Asia"],
  GK: ["捷星日本航空", "捷星日本航空", "Jetstar Japan"],
  SV: ["沙特阿拉伯航空", "沙地阿拉伯航空", "Saudia"],
  GA: ["印尼鹰航", "印尼鷹航", "Garuda Indonesia"],
  AK: ["亚洲航空", "亞洲航空", "AirAsia"],
  D7: ["全亚洲航空", "全亞洲航空", "AirAsia X"],
  XJ: ["泰国亚洲航空长途", "泰國亞洲航空長途", "Thai AirAsia X"],
  Z2: ["菲律宾亚洲航空", "菲律賓亞洲航空", "AirAsia Philippines"],
  QZ: ["印尼亚洲航空", "印尼亞洲航空", "Indonesia AirAsia"],
  SL: ["泰国狮航", "泰國獅航", "Thai Lion Air"],
  JT: ["印尼狮航", "印尼獅航", "Lion Air"],
  OD: ["马印航空", "馬印航空", "Batik Air Malaysia"],
  QH: ["越竹航空", "越竹航空", "Bamboo Airways"],
  VJ: ["越捷航空", "越捷航空", "VietJet Air"],
  HO: ["吉祥航空", "吉祥航空", "Juneyao Air"],
  JD: ["首都航空", "首都航空", "Beijing Capital Airlines"],
  "8L": ["祥鹏航空", "祥鵬航空", "Lucky Air"],
  PN: ["西部航空", "西部航空", "West Air"],
  KN: ["中国联合航空", "中國聯合航空", "China United Airlines"],
  A6: ["湖南航空", "湖南航空", "Air Travel"],
  QW: ["青岛航空", "青島航空", "Qingdao Airlines"],
  DZ: ["东海航空", "東海航空", "Donghai Airlines"],
  FU: ["福州航空", "福州航空", "Fuzhou Airlines"],
  BK: ["奥凯航空", "奧凱航空", "Okay Airways"],
  OQ: ["重庆航空", "重慶航空", "Chongqing Airlines"],
  LT: ["龙江航空", "龍江航空", "LJ Air"],
  GX: ["北部湾航空", "北部灣航空", "GX Airlines"],
  RY: ["江西航空", "江西航空", "Jiangxi Air"],
  "9H": ["长安航空", "長安航空", "Air Changan"],
  JR: ["幸福航空", "幸福航空", "Joy Air"],
  ZH: ["深圳航空", "深圳航空", "Shenzhen Airlines"],
  "3U": ["四川航空", "四川航空", "Sichuan Airlines"],
  NX: ["澳门航空", "澳門航空", "Air Macau"],
  HB: ["大湾区航空", "大灣區航空", "Greater Bay Airlines"],
  UO: ["香港快运", "香港快運", "HK Express"],
  IT: ["台湾虎航", "台灣虎航", "Tigerair Taiwan"],
  B7: ["立荣航空", "立榮航空", "UNI Air"],
  AE: ["华信航空", "華信航空", "Mandarin Airlines"],
  MM: ["乐桃航空", "樂桃航空", "Peach"],
  "7C": ["济州航空", "濟州航空", "Jeju Air"],
  LJ: ["真航空", "真航空", "Jin Air"],
  TW: ["德威航空", "德威航空", "T'way Air"],
  BX: ["釜山航空", "釜山航空", "Air Busan"],
  RS: ["首尔航空", "首爾航空", "Air Seoul"],
  ZE: ["易斯达航空", "易斯達航空", "Eastar Jet"],
  "5J": ["宿务太平洋航空", "宿霧太平洋航空", "Cebu Pacific"],
  PR: ["菲律宾航空", "菲律賓航空", "Philippine Airlines"],
  TG: ["泰国国际航空", "泰國國際航空", "Thai Airways"],
  FD: ["泰国亚洲航空", "泰國亞洲航空", "Thai AirAsia"],
  PG: ["曼谷航空", "曼谷航空", "Bangkok Airways"],
  DD: ["飞鸟航空", "飛鳥航空", "Nok Air"],
  WE: ["泰国微笑航空", "泰國微笑航空", "Thai Smile"],
  MH: ["马来西亚航空", "馬來西亞航空", "Malaysia Airlines"],
  TR: ["酷航", "酷航", "Scoot"],
  SQ: ["新加坡航空", "新加坡航空", "Singapore Airlines"],
  AI: ["印度航空", "印度航空", "Air India"],
  "6E": ["靛蓝航空", "靛藍航空", "IndiGo"],
  UL: ["斯里兰卡航空", "斯里蘭卡航空", "SriLankan Airlines"],
  EK: ["阿联酋航空", "阿聯酋航空", "Emirates"],
  EY: ["阿提哈德航空", "阿提哈德航空", "Etihad Airways"],
  QR: ["卡塔尔航空", "卡塔爾航空", "Qatar Airways"],
  TK: ["土耳其航空", "土耳其航空", "Turkish Airlines"],
  GF: ["海湾航空", "海灣航空", "Gulf Air"],
  WY: ["阿曼航空", "阿曼航空", "Oman Air"],
  FZ: ["迪拜航空", "杜拜航空", "flydubai"],
  LY: ["以色列航空", "以色列航空", "El Al"],
  J2: ["阿塞拜疆航空", "阿塞拜疆航空", "Azerbaijan Airlines"],
  ET: ["埃塞俄比亚航空", "埃塞俄比亞航空", "Ethiopian Airlines"],
  KQ: ["肯尼亚航空", "肯雅航空", "Kenya Airways"],
  MS: ["埃及航空", "埃及航空", "EgyptAir"],
  AT: ["摩洛哥皇家航空", "摩洛哥皇家航空", "Royal Air Maroc"],
  BA: ["英国航空", "英國航空", "British Airways"],
  VS: ["维珍航空", "維珍航空", "Virgin Atlantic"],
  LH: ["汉莎航空", "漢莎航空", "Lufthansa"],
  LX: ["瑞士国际航空", "瑞士國際航空", "Swiss"],
  OS: ["奥地利航空", "奧地利航空", "Austrian Airlines"],
  SN: ["布鲁塞尔航空", "布魯塞爾航空", "Brussels Airlines"],
  AF: ["法国航空", "法國航空", "Air France"],
  KL: ["荷兰皇家航空", "荷蘭皇家航空", "KLM"],
  AY: ["芬兰航空", "芬蘭航空", "Finnair"],
  SK: ["北欧航空", "北歐航空", "SAS"],
  IB: ["西班牙国家航空", "西班牙國家航空", "Iberia"],
  VY: ["伏林航空", "伏林航空", "Vueling"],
  TP: ["葡萄牙航空", "葡萄牙航空", "TAP Air Portugal"],
  AZ: ["意大利航空", "意大利航空", "ITA Airways"],
  EI: ["爱尔兰航空", "愛爾蘭航空", "Aer Lingus"],
  FR: ["瑞安航空", "瑞安航空", "Ryanair"],
  U2: ["易捷航空", "易捷航空", "easyJet"],
  W6: ["维兹航空", "維茲航空", "Wizz Air"],
  DY: ["挪威航空", "挪威航空", "Norwegian"],
  LO: ["波兰航空", "波蘭航空", "LOT Polish Airlines"],
  A3: ["爱琴海航空", "愛琴海航空", "Aegean Airlines"],
  FI: ["冰岛航空", "冰島航空", "Icelandair"],
  SU: ["俄罗斯航空", "俄羅斯航空", "Aeroflot"],
  UA: ["美国联合航空", "美國聯合航空", "United Airlines"],
  DL: ["达美航空", "達美航空", "Delta Air Lines"],
  AS: ["阿拉斯加航空", "阿拉斯加航空", "Alaska Airlines"],
  B6: ["捷蓝航空", "捷藍航空", "JetBlue"],
  WN: ["西南航空", "西南航空", "Southwest Airlines"],
  HA: ["夏威夷航空", "夏威夷航空", "Hawaiian Airlines"],
  AC: ["加拿大航空", "加拿大航空", "Air Canada"],
  WS: ["西捷航空", "西捷航空", "WestJet"],
  LA: ["南美航空", "南美航空", "LATAM Airlines"],
  AV: ["哥伦比亚航空", "哥倫比亞航空", "Avianca"],
  CM: ["巴拿马航空", "巴拿馬航空", "Copa Airlines"],
  AR: ["阿根廷航空", "阿根廷航空", "Aerolíneas Argentinas"],
  G3: ["高尔航空", "高爾航空", "GOL"],
  AD: ["蓝色巴西航空", "藍色巴西航空", "Azul"],
  NZ: ["新西兰航空", "紐西蘭航空", "Air New Zealand"],
  VA: ["维珍澳洲航空", "維珍澳洲航空", "Virgin Australia"],
  SA: ["南非航空", "南非航空", "South African Airways"],
};

const isLatin = (text) => !/[㐀-鿿]/.test(text);
const cleanZh = (text) => text?.trim().replace(/(股份)?有限公司$|公司$/u, "").trim() || "";
const tokens = (text) => new Set((text ?? "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter((word) => word && !["air", "airlines", "airline", "airways", "aviation", "the", "ltd", "limited", "co", "company", "international", "de", "of"].includes(word)));
const overlap = (a, b) => { const x = tokens(a), y = tokens(b); let shared = 0; for (const word of x) if (y.has(word)) shared++; return shared / Math.max(1, Math.min(x.size, y.size)); };

async function get(url, options = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { "user-agent": options.agent ?? AGENT, ...options.headers }, signal: AbortSignal.timeout(30_000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((done) => setTimeout(done, 1500 * (attempt + 1)));
    }
  }
}

const WIKIDATA_QUERY = `SELECT ?item ?iata ?icao ?en ?hans ?cn ?hant ?hk ?tw ?zh ?dissolved ?sitelinks WHERE {
  ?item wdt:P229 ?iata .
  OPTIONAL { ?item wdt:P230 ?icao }
  OPTIONAL { ?item wdt:P576 ?dissolved }
  OPTIONAL { ?item wikibase:sitelinks ?sitelinks }
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en)="en") }
  OPTIONAL { ?item rdfs:label ?hans FILTER(LANG(?hans)="zh-hans") }
  OPTIONAL { ?item rdfs:label ?cn FILTER(LANG(?cn)="zh-cn") }
  OPTIONAL { ?item rdfs:label ?hant FILTER(LANG(?hant)="zh-hant") }
  OPTIONAL { ?item rdfs:label ?hk FILTER(LANG(?hk)="zh-hk") }
  OPTIONAL { ?item rdfs:label ?tw FILTER(LANG(?tw)="zh-tw") }
  OPTIONAL { ?item rdfs:label ?zh FILTER(LANG(?zh)="zh") }
}`;

async function fetchSources() {
  await mkdir(join(cache, "marks"), { recursive: true });
  for (const locale of ["en", "zh-CN", "zh-TW"]) {
    await writeFile(join(cache, `travelpayouts-${locale}.json`), await get(`https://api.travelpayouts.com/data/${locale}/airlines.json`));
  }
  const query = new URLSearchParams({ query: WIKIDATA_QUERY, format: "json" });
  await writeFile(join(cache, "wikidata.json"), await get(`https://query.wikidata.org/sparql?${query}`, { headers: { accept: "application/sparql-results+json" } }));
  await writeFile(join(cache, "soaring.json"), await get("https://raw.githubusercontent.com/soaring-symbols/soaring-symbols/main/airlines.json"));
}

async function fetchMarks(codes, soaring) {
  const dir = join(cache, "marks");
  await mkdir(dir, { recursive: true });
  let blank = null;
  const isBlank = async (image) => {
    blank ??= createHash("md5").update(await get("https://www.gstatic.com/flights/airline_logos/70px/ZZ.png") ?? "").digest("hex");
    return createHash("md5").update(image).digest("hex") === blank;
  };
  const jobs = [...codes];
  const worker = async () => {
    for (let code = jobs.shift(); code; code = jobs.shift()) {
      const has = (suffix) => existsSync(join(dir, `${code}.${suffix}`));
      if (has("svg") || has("kayak.png") || has("google.png") || has("none")) continue;
      const slug = soaring.get(code);
      // Some catalogue entries have a logo but no square icon; those fall through.
      const svg = slug ? await get(`https://raw.githubusercontent.com/soaring-symbols/soaring-symbols/main/assets/${slug}/icon.svg`) : null;
      if (svg) { await writeFile(join(dir, `${code}.svg`), svg); continue; }
      const kayak = await get(`https://content.r9cdn.net/rimg/provider-logos/airlines/v/${code}.png?crop=false&width=240&height=240`, { agent: "Mozilla/5.0" });
      if (kayak) { await writeFile(join(dir, `${code}.kayak.png`), kayak); continue; }
      const google = await get(`https://www.gstatic.com/flights/airline_logos/70px/${code}.png`);
      if (google && !(await isBlank(google))) { await writeFile(join(dir, `${code}.google.png`), google); continue; }
      await writeFile(join(dir, `${code}.none`), "");
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
}

// Names: the code list and English names from Travelpayouts; Chinese from the
// Wikidata item for that code whose English name matches, then Travelpayouts.
async function buildNames() {
  const list = (locale) => JSON.parse(readFileSync(join(cache, `travelpayouts-${locale}.json`)));
  const english = list("en"), simplified = new Map(list("zh-CN").map((item) => [item.code, item.name])), traditional = new Map(list("zh-TW").map((item) => [item.code, item.name]));
  const rows = JSON.parse(readFileSync(join(cache, "wikidata.json"))).results.bindings;
  const items = new Map();
  for (const row of rows) {
    const item = items.get(row.item.value) ?? {};
    for (const [key, value] of Object.entries(row)) item[key] ??= value.value;
    items.set(row.item.value, item);
  }
  const byCode = new Map();
  for (const item of items.values()) {
    const code = item.iata.trim().toUpperCase();
    byCode.set(code, [...(byCode.get(code) ?? []), item]);
  }
  const names = {};
  const icao = {};
  for (const entry of english) {
    const code = entry.code;
    if (!/^[A-Z0-9]{2}$/.test(code) || !entry.name) continue;
    const en = entry.name_translations?.en || entry.name;
    const candidates = (byCode.get(code) ?? []).map((item) => ({ item, score: overlap(item.en ?? item.zh ?? "", en) + (item.dissolved ? -0.5 : 0) }));
    candidates.sort((a, b) => b.score - a.score || Number(b.item.sitelinks ?? 0) - Number(a.item.sitelinks ?? 0));
    const match = candidates[0]?.score >= 0.5 ? candidates[0].item : null;
    let hans = "", hant = "";
    if (match) {
      const simplifiedLabel = match.hans || match.cn;
      const traditionalLabel = match.hk || match.hant || match.tw;
      hans = simplifiedLabel || (match.zh && toHans(match.zh)) || (traditionalLabel && toHans(traditionalLabel)) || "";
      hant = traditionalLabel || (hans && toHant(hans)) || "";
      if (match.icao && /^[A-Z]{3}$/.test(match.icao)) icao[match.icao] = code;
    }
    const tpHans = cleanZh(simplified.get(code)), tpHant = cleanZh(traditional.get(code));
    if (!hans || isLatin(hans)) hans = !isLatin(tpHans) ? tpHans : !isLatin(tpHant) ? toHans(tpHant) : "";
    if (!hant || isLatin(hant)) hant = hans ? toHant(hans) : "";
    names[code] = hans ? [cleanZh(hans), cleanZh(hant), en] : [en, en, en];
  }
  const curated = JSON.parse(readFileSync(join(root, "app/lib/server/names.json"))).carriers;
  for (const [code, value] of Object.entries({ ...NAMES, ...curated })) names[code] = value;
  return { names, icao };
}



if (fetchFirst || !existsSync(join(cache, "wikidata.json"))) await fetchSources();
const soaringList = JSON.parse(readFileSync(join(cache, "soaring.json")));
const soaring = new Map(soaringList.filter((item) => item.iata).map((item) => [item.iata, item.slug]));
const { names, icao } = await buildNames();
const codes = Object.keys(names).sort();
await fetchMarks(codes, soaring);

await mkdir(out, { recursive: true });
for (const file of await readdir(out)) if (file.endsWith(".webp")) await rm(join(out, file));
const marks = [];
const dir = join(cache, "marks");
for (const code of codes) {
  const source = REASSIGNED.has(code) ? null : sourceOf(dir, code, existsSync);
  if (!source) continue;
  try {
    const image = await normalise(await readFile(source[0]), source[1]);
    await writeFile(join(out, `${code}.webp`), image);
    marks.push(code);
  } catch (error) {
    console.warn(`${code}: ${error.message}`);
  }
}
await writeFile(join(root, "app/lib/server/carriers.json"), `${JSON.stringify({ names, icao })}\n`);
await writeFile(join(root, "app/lib/carrier-marks.json"), `${JSON.stringify(marks)}\n`);
console.log(`${codes.length} airlines named, ${marks.length} marks, ${Object.keys(icao).length} ICAO designators`);
