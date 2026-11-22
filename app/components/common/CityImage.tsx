"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { metroOf } from "../../lib/places";
import styles from "./CityImage.module.css";

// Bumped with IMAGE_VERSION on the server, so a reframed picture replaces the kept one.
const VERSION = 1;
// Pictures this tab already found missing are not asked for again.
const missing = new Set<string>();

// A city from above, as the app shows it: the satellite picture the site
// keeps for it (/api/imagery), faded in over a quiet tile, with the
// country's outline in its place while it loads or where there is none.
export default function CityImage({ code, kind = "square", fallback, className }: { code: string; kind?: "square" | "wide"; fallback?: React.ReactNode; className?: string }) {
  const src = `/api/imagery?at=${encodeURIComponent(metroOf(code))}&kind=${kind}&v=${VERSION}`;
  return (
    <span className={`${styles.frame}${className ? ` ${className}` : ""}`} data-kind={kind} aria-hidden="true">
      <Picture key={src} src={src} fallback={fallback} />
    </span>
  );
}

function Picture({ src, fallback }: { src: string; fallback?: React.ReactNode }) {
  const image = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<"loading" | "shown" | "missing">(() => missing.has(src) ? "missing" : "loading");
  // A picture from the cache can finish before the page is live, and then
  // its load event has already gone by.
  useEffect(() => {
    const element = image.current;
    if (element?.complete) setState(element.naturalWidth > 0 ? "shown" : "missing");
  }, []);
  const fail = () => { missing.add(src); setState("missing"); };
  return (
    <>
      {state !== "shown" && fallback ? <span className={styles.fallback}>{fallback}</span> : null}
      {state !== "missing" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a kept JPEG from this site, sized by its frame
        <img ref={image} src={src} alt="" loading="lazy" decoding="async" data-shown={state === "shown" ? "true" : undefined} onLoad={() => setState("shown")} onError={fail} />
      ) : null}
    </>
  );
}

const CREDIT = {
  "zh-Hans": "城市影像：Sentinel-2 cloudless 2024 © EOX IT Services GmbH（含经修改的 Copernicus Sentinel 2024 数据），CC BY-NC-SA 4.0",
  "zh-Hant": "城市影像：Sentinel-2 cloudless 2024 © EOX IT Services GmbH（含經修改的 Copernicus Sentinel 2024 資料），CC BY-NC-SA 4.0",
  en: "City imagery: Sentinel-2 cloudless 2024 © EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024), CC BY-NC-SA 4.0",
} as const;

export function ImageryCredit({ locale }: { locale: keyof typeof CREDIT }) {
  return <p className={styles.credit}>{CREDIT[locale]}</p>;
}

// A page's head over its city from above, as the app heads a trip or a
// place: the picture fading into the panel, the name over it, the country's
// outline at the side. With `href`, the whole head opens that page.
export function CityHero({ code, href, eyebrow, mark, children }: { code: string; href?: string; eyebrow?: string; mark?: React.ReactNode; children: React.ReactNode }) {
  const body = (
    <>
      <CityImage code={code} kind="wide" className={styles.heroImage} />
      <span className={styles.heroText}>
        {eyebrow ? <small>{eyebrow}</small> : null}
        {children}
      </span>
      {mark ? <span className={styles.heroMark}>{mark}</span> : null}
    </>
  );
  return href ? <Link href={href} className={styles.hero}>{body}</Link> : <div className={styles.hero}>{body}</div>;
}
