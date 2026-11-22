export type Locale = "zh-Hans" | "zh-Hant" | "en";

// The product's name as each reader says it; the address is the same for all.
export const brandName: Record<Locale, string> = { "zh-Hans": "航迹", "zh-Hant": "航跡", en: "Flyprint" };

export const localeOptions: { value: Locale; label: string; short: string }[] = [
  { value: "zh-Hans", label: "简体中文", short: "简" },
  { value: "zh-Hant", label: "繁體中文", short: "繁" },
  { value: "en", label: "English", short: "EN" },
];

import { carrierNamesOf, placeOf } from "./atlas";

export const localeIndex = (locale:Locale) => locale === "zh-Hans" ? 0 : locale === "zh-Hant" ? 1 : 2;
export const cityName = (code:string, locale:Locale) => placeOf(code)?.city[localeIndex(locale)] ?? code;
export const airportName = (code:string, locale:Locale, fallback:string) => placeOf(code)?.name[localeIndex(locale)] ?? fallback;
export const carrierName = (code:string, locale:Locale) => carrierNamesOf(code)?.[localeIndex(locale)] ?? code;
