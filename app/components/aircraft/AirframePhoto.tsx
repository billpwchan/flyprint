"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AirframePhoto.module.css";

// A photograph of the very airframe, from Planespotters' public photo API.
// Its terms: hotlink the image, name the photographer, link to the photo's
// page, keep nothing past a day. So the browser asks, the image loads from
// their host, and nothing is stored beyond the HTTP cache.
type Photo = { src: string; link: string; photographer: string };

const requests = new Map<string, Promise<Photo | null>>();
const fromHost = (value: unknown, host: string) => {
  try { return typeof value === "string" && new URL(value).protocol === "https:" && new URL(value).host === host ? value : null; } catch { return null; }
};

// "No photo" is remembered for the page's life; a failed request is not, so
// the next view of this airframe asks again.
function photoOf(registration: string) {
  let request = requests.get(registration);
  if (!request) {
    request = fetch(`https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(registration)}`)
      .then((response) => {
        if (response.ok) return response.json();
        if (response.status !== 404) requests.delete(registration);
        return null;
      })
      .then((data: { photos?: { thumbnail_large?: { src?: string }; link?: string; photographer?: string }[] } | null) => {
        const photo = data?.photos?.[0];
        const src = fromHost(photo?.thumbnail_large?.src, "t.plnspttrs.net");
        const link = fromHost(photo?.link, "www.planespotters.net");
        return src && link ? { src, link, photographer: typeof photo?.photographer === "string" ? photo.photographer : "" } : null;
      })
      .catch(() => {
        requests.delete(registration);
        return null;
      });
    requests.set(registration, request);
  }
  return request;
}

// The frame keeps its size whatever comes back, so nothing below it moves:
// the photograph, or the registration set like a placard when there is none.
export default function AirframePhoto({ registration, credit }: { registration: string; credit: (photographer: string) => string }) {
  const frame = useRef<HTMLElement>(null);
  const [answer, setAnswer] = useState<{ registration: string; photo: Photo | null } | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [broken, setBroken] = useState<string | null>(null);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let live = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      photoOf(registration).then((photo) => { if (live) setAnswer({ registration, photo }); });
    }, { rootMargin: "240px" });
    observer.observe(element);
    return () => { live = false; observer.disconnect(); };
  }, [registration]);

  const current = answer?.registration === registration ? answer : null;
  const photo = current?.photo && current.photo.src !== broken ? current.photo : null;
  return (
    <figure ref={frame} className={styles.airframe}>
      <div className={styles.frame} data-state={!current ? "waiting" : photo ? "photo" : "none"}>
        {photo ? (
          <a href={photo.link} target="_blank" rel="noopener noreferrer" tabIndex={-1}>
            {/* Hotlinked as the photo's terms require; never proxied or resized here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.src} alt={registration} width={420} height={280} decoding="async" data-shown={shown === photo.src ? "true" : undefined} onLoad={() => setShown(photo.src)} onError={() => setBroken(photo.src)} />
          </a>
        ) : current ? <span className={styles.placard}>{registration}</span> : null}
      </div>
      {photo && shown === photo.src ? (
        <figcaption className={styles.credit}>
          <a href={photo.link} target="_blank" rel="noopener noreferrer">{credit(photo.photographer)}</a>
        </figcaption>
      ) : null}
    </figure>
  );
}
