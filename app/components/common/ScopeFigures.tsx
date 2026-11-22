"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Flight } from "../../lib/data";
import type { Locale } from "../../lib/i18n";
import { summarize } from "../../lib/insights";
import { formatNumber } from "../../lib/copy";
import styles from "./ScopeFigures.module.css";

const t = (locale: Locale, hans: string, hant: string, en: string) => locale === "en" ? en : locale === "zh-Hant" ? hant : hans;
// Intl rounds half away from zero, as the app now does: 26,500 km is 2.7 万.
const one = (value: number, locale: Locale) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);

// One quiet line of how far, how long and how many places, as the app says it.
export function scopeLine(list: Flight[], locale: Locale) {
  const summary = summarize(list);
  const hours = summary.minutes / 60;
  const distance = locale !== "en" && summary.km >= 10_000
    ? `${one(summary.km / 10_000, locale)} ${t(locale, "万公里", "萬公里", "")}`
    : `${formatNumber(summary.km, locale)} ${t(locale, "公里", "公里", "km")}`;
  const aloft = hours >= 48
    ? t(locale, `${one(hours / 24, locale)} 天在空中`, `${one(hours / 24, locale)} 天在空中`, `${one(hours / 24, locale)} days in the air`)
    : t(locale, `${Math.round(hours)} 小时在空中`, `${Math.round(hours)} 小時在空中`, `${Math.round(hours)} hours in the air`);
  const countries = formatNumber(summary.countries, locale);
  const places = t(locale, `${countries} 个国家和地区`, `${countries} 個國家和地區`, summary.countries === 1 ? "1 country" : `${countries} countries`);
  return [distance, aloft, places].join(" · ");
}

// The scope in view as the app heads it: how many flights, large, and one
// quiet line under it. On the trips it opens the footprint; on the footprint
// it is the head.
export default function ScopeFigures({ flights, locale, year, href, action }: { flights: Flight[]; locale: Locale; year?: number | null; href?: string; action?: React.ReactNode }) {
  if (!flights.length) return null;
  const count = (
    <>
      <h1 className={styles.count}>
        {year ? <span className="visually-hidden">{t(locale, `${year} 年`, `${year} 年`, `In ${year}:`)}</span> : null}
        <b>{formatNumber(flights.length, locale)}</b>
        <span>{t(locale, "次飞行", "次飛行", flights.length === 1 ? "flight" : "flights")}</span>
        {href ? <ChevronRight aria-hidden="true" className={styles.chevron} /> : null}
      </h1>
      <span className={styles.line}>{scopeLine(flights, locale)}</span>
    </>
  );
  return (
    <div className={styles.scope}>
      {href ? <Link href={href} className={styles.figures} aria-description={t(locale, "打开足迹", "打開足跡", "Opens your footprint")}>{count}</Link> : <div className={styles.figures}>{count}</div>}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
