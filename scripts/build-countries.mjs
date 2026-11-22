// Country names in the three interface languages, written out once so the
// server and the browser never depend on their own ICU data (they disagree:
// Node says 中国香港特别行政区 where Chrome says 香港).
// Usage: node scripts/build-countries.mjs
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const here = resolve(import.meta.dirname, "../app/lib/server");
const airports = JSON.parse(await readFile(resolve(here, "airports.json"), "utf8"));
const codes = [...new Set(Object.values(airports).map((airport) => airport[2]))].filter((code) => /^[A-Z]{2}$/.test(code)).sort();
const names = (locale) => new Intl.DisplayNames([locale], { type: "region" });
const [hans, hant, en] = [names("zh-Hans-CN"), names("zh-Hant-HK"), names("en-GB")];
// Short forms people use, where the full name reads like a form field.
const preferred = {
  HK: ["香港", "香港", "Hong Kong"], MO: ["澳门", "澳門", "Macao"], TW: ["台湾", "台灣", "Taiwan"], CN: ["中国", "中國", "China"],
  KR: ["韩国", "南韓", "South Korea"], KP: ["朝鲜", "北韓", "North Korea"], AE: ["阿联酋", "阿聯酋", "United Arab Emirates"],
  US: ["美国", "美國", "United States"], GB: ["英国", "英國", "United Kingdom"], AU: ["澳大利亚", "澳洲", "Australia"],
  NZ: ["新西兰", "紐西蘭", "New Zealand"], ID: ["印度尼西亚", "印尼", "Indonesia"], RU: ["俄罗斯", "俄羅斯", "Russia"],
  VN: ["越南", "越南", "Vietnam"], LA: ["老挝", "寮國", "Laos"], MM: ["缅甸", "緬甸", "Myanmar"], CZ: ["捷克", "捷克", "Czechia"],
};
const table = {};
for (const code of codes) {
  const value = preferred[code] ?? [hans.of(code), hant.of(code), en.of(code)];
  if (value.every((name) => name && name !== code)) table[code] = value;
}
await writeFile(resolve(here, "countries.json"), `${JSON.stringify(table)}\n`);
console.log(`${Object.keys(table).length} countries`);
