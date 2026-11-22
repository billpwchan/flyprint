"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Plus } from "lucide-react";
import type { YearCount } from "../../lib/insights";
import { accountUi } from "../../lib/copy-account";
import { useLocale } from "../LocaleProvider";
import { brandName } from "../../lib/i18n";
import { publicUi } from "../../lib/copy-public";
import { useArchive, useShared, useViewer } from "../ArchiveProvider";
import { toneColor } from "../../lib/palette";
import { formatNumber } from "../../lib/copy";
import TimeBar from "./TimeBar";
import styles from "./common.module.css";

// A section screen: the time bar stays at the top while the rest scrolls under it.
// ownFlights: the screen measures the reader's own flights, so with none it
// points to importing instead.
export function Lens({ counts, year, onYear, onPreviewYear, ownFlights = true, children }: {
  counts: YearCount[];
  year: number | null;
  onYear: (year: number | null) => void;
  onPreviewYear: (year: number | null) => void;
  ownFlights?: boolean;
  children: React.ReactNode;
}) {
  const { locale } = useLocale();
  const viewer = useViewer();
  const { all, links, owner } = useArchive();
  const shared = useShared();
  const text = accountUi[locale];
  const words = publicUi[locale];
  const pathname = usePathname() ?? "/";
  // Visitors see the sample, and the sample's page for two from wherever they are.
  const sample = !viewer && links[0] && !pathname.startsWith("/with/") ? links[0] : null;
  // A trial's one standing line, on every screen of its own.
  const trial = viewer?.trial && !shared ? (
    <div className={styles.trial}>
      <p>{text.trial.line(formatNumber(viewer.trial, locale))}</p>
      <Link href="/signup" className={styles.emptyAction}>{text.trial.keep}</Link>
    </div>
  ) : null;
  // A new account has nothing to measure yet: one way forward, to importing.
  if (ownFlights && viewer && !shared && !all.length) {
    return (
      <div className={styles.lens}>
        {trial}
        <div className={styles.emptyArchive}>
          <h1 className={styles.headline}>{text.empty.title}</h1>
          <p>{text.empty.body}</p>
          <Link href="/import" className={styles.emptyAction}><Plus aria-hidden="true" />{text.empty.action}</Link>
        </div>
      </div>
    );
  }
  // A first visit opens on what this is and one way in, importing without an
  // account; the sample follows.
  const intro = !viewer && !shared && pathname === "/";
  return (
    <div className={styles.lens}>
      {intro ? (
        <div className={styles.intro}>
          <p className={styles.introLine}>{words.intro.line}</p>
          <div className={styles.introActions}>
            <Link href="/import" className={styles.emptyAction}>{words.intro.start}</Link>
            <Link href="/login" className={styles.introQuiet}>{words.intro.signIn}</Link>
          </div>
        </div>
      ) : null}
      {trial}
      {shared ? (
        <p className={styles.sharedBy} style={{ "--tone": toneColor(owner.tone) } as React.CSSProperties}>
          <i aria-hidden="true" />
          {shared.mine
            ? <>{words.shared.yours}<span aria-hidden="true"> · </span><Link href="/settings#share">{words.shared.edit}</Link></>
            : <><strong>{words.shared.title(owner.name)}</strong>{viewer ? <><span aria-hidden="true"> · </span><Link href="/">{words.shared.mine}</Link></> : null}</>}
        </p>
      ) : null}
      {counts.length ? (
        <div className={styles.lensHead} data-lens-head>
          <TimeBar counts={counts} year={year} locale={locale} onSelect={onYear} onPreview={onPreviewYear} />
        </div>
      ) : null}
      {shared ? null : intro ? (
        <p className={styles.demo}>
          {words.intro.sample}
          {sample ? <><span aria-hidden="true"> · </span><Link href={`/with/${encodeURIComponent(sample.id)}`}>{words.intro.samplePair}</Link></> : null}
        </p>
      ) : viewer ? null : (
        <p className={styles.demo}>
          {text.menu.demo}<span aria-hidden="true"> · </span>
          {sample ? <><Link href={`/with/${encodeURIComponent(sample.id)}`}>{text.menu.samplePair}</Link><span aria-hidden="true"> · </span></> : null}
          <Link href="/login">{text.menu.signIn}</Link><span aria-hidden="true"> / </span><Link href="/signup">{text.menu.signUp}</Link>
        </p>
      )}
      <div key={year ?? "all"} className={styles.body} data-fade="">{children}</div>
      {shared && !viewer ? (
        <div className={styles.outro}>
          <p className={styles.introLine}>{words.intro.line}</p>
          <div className={styles.introActions}>
            <Link href="/import" className={styles.emptyAction}>{words.shared.own}</Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Figures({ items }: { items: { value: string; label: string }[] }) {
  return (
    <dl className={styles.figures}>
      {items.map((item) => (
        <div key={item.label} className={styles.figure}>
          <dt className="visually-hidden">{item.label}</dt>
          <dd style={{ display: "contents" }}>
            <strong>{item.value}</strong>
            <span aria-hidden="true">{item.label}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

// The tab title follows the screen and the language without a reload.
export function useTitle(name: string | null) {
  const { locale } = useLocale();
  useEffect(() => {
    const brand = brandName[locale];
    document.title = name ? `${name} — ${brand}` : brand;
  }, [name, locale]);
}
