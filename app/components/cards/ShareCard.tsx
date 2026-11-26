"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Share, X } from "lucide-react";
import { ui } from "../../lib/copy";
import { useLocale } from "../LocaleProvider";
import { useArchive, useShared } from "../ArchiveProvider";
import type { CardRequest } from "./cards";
import styles from "./ShareCard.module.css";

const subscribeNothing = () => () => {};
const shareSheetAvailable = () => typeof navigator.canShare === "function" && window.matchMedia("(pointer: coarse)").matches;
// Browsers inside chat and social apps neither download files nor share them;
// there the picture is shown so it can be saved by pressing on it.
const insideApp = () => /MicroMessenger|XiaoHongShu|xhsdiscover|Weibo|QQ\/|DingTalk|aweme|Lark/i.test(navigator.userAgent);
// On a computer a picture usually goes into a chat by pasting, so it can be copied too.
const clipboardTakesImages = () => typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";
const stillMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Known at once, so the picture-or-film switch is there from the start
// instead of arriving under the card a moment later.
const encoderExists = () => typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
// A file just handed to a download may still be read from its address.
const releaseLater = (url: string) => window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
const subscribeMotion = (change: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};

// The clipboard takes PNG only.
async function asPNG(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((made) => made ? resolve(made) : reject(new Error("png")), "image/png"));
  canvas.width = canvas.height = 0;
  return png;
}

type Item = { url: string; file: File };
type Made = Item | "failed" | null;
// A film is a share of the way made until it is an item.
type Film = Item | "failed" | number | null;
const isItem = (value: Made | Film): value is Item => !!value && typeof value === "object";

// A year, trip or flight as a picture to send: the button opens the card at
// full size, made on this device, with one button under it to share or save
// it. The share sheet opens from that second press, so it always has the
// gesture it needs even when making the picture took a while. Once the
// picture has gone somewhere the preview closes. Someone else's public page
// offers none: a visitor doesn't make posters of another person's travels.
// A year's card can also go as a short film of the card coming together,
// where this browser can encode one; it is made only once asked for.
export default function ShareCard({ request, quiet = false }: { request: CardRequest; quiet?: boolean }) {
  const { locale } = useLocale();
  const text = ui[locale].cards;
  const { flights, owner } = useArchive();
  const shared = useShared();
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<Made>(null);
  const [copied, setCopied] = useState(false);
  const [filmable, setFilmable] = useState<boolean | null>(null);
  const [kind, setKind] = useState<"picture" | "video">("picture");
  const [filmWanted, setFilmWanted] = useState(false);
  const [film, setFilm] = useState<Film>(null);
  const [attempt, setAttempt] = useState(0);
  const canShare = useSyncExternalStore(subscribeNothing, shareSheetAvailable, () => false);
  const inApp = useSyncExternalStore(subscribeNothing, insideApp, () => false);
  const canCopy = useSyncExternalStore(subscribeNothing, clipboardTakesImages, () => false);
  const reduced = useSyncExternalStore(subscribeMotion, stillMotion, () => false);
  const encoding = useSyncExternalStore(subscribeNothing, encoderExists, () => false);
  const trigger = useRef<HTMLButtonElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const key = request.kind === "year" ? `year-${request.year ?? "all"}` : request.kind === "trip" ? `trip-${request.trip.id}` : `flight-${request.flight.id}`;
  const offerFilm = request.kind === "year" && encoding && filmable !== false && made !== "failed";
  const video = open && kind === "video" && offerFilm;
  // In a chat app's browser the film couldn't be saved, so it isn't made there.
  const filming = video && !inApp;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        const { printCard, cardName } = await import("./cards");
        const blob = await printCard(request, { locale, owner, flown: flights });
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setMade({ url, file: new File([blob], `${cardName(request, locale)}.jpg`, { type: "image/jpeg" }) });
      } catch {
        if (!cancelled) setMade("failed");
      }
    })();
    return () => {
      cancelled = true;
      if (url) releaseLater(url);
      setMade(null);
      setCopied(false);
    };
    // The card is made once per opening, for what the page shows then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, locale]);

  useEffect(() => {
    if (!open || request.kind !== "year") return;
    let cancelled = false;
    import("./film").then(({ filmSupport }) => filmSupport()).then((config) => { if (!cancelled) setFilmable(!!config); }, () => {});
    return () => { cancelled = true; };
  }, [open, request.kind]);

  // The film, made once per opening after it is first asked for; going back
  // to the picture doesn't stop it, so it is there if asked for again. Asking
  // again after it failed makes it again.
  useEffect(() => {
    if (!open || !filmWanted || request.kind !== "year") return;
    const stop = new AbortController();
    let url: string | null = null;
    (async () => {
      try {
        const [{ printFilm }, { cardName }] = await Promise.all([import("./film"), import("./cards")]);
        let shown = -1;
        const blob = await printFilm(request, { locale, owner, flown: flights }, (share) => {
          const percent = Math.floor(share * 100);
          if (percent !== shown && !stop.signal.aborted) { shown = percent; setFilm(share); }
        }, stop.signal);
        if (stop.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setFilm({ url, file: new File([blob], `${cardName(request, locale)}.mp4`, { type: "video/mp4" }) });
      } catch {
        if (!stop.signal.aborted) setFilm("failed");
      }
    })();
    return () => {
      stop.abort();
      if (url) releaseLater(url);
      setFilm(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filmWanted, attempt, key, locale]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    // Focus leaves the page at once, so arrow keys can't turn the page behind while the card is made.
    closer.current?.focus();
    const opener = trigger.current;
    return () => { window.removeEventListener("keydown", onKey); opener?.focus(); };
  }, [open]);

  useEffect(() => { if (made && made !== "failed") action.current?.focus(); }, [made]);

  const current = filming ? film : made;
  const ready = isItem(current);

  const send = async () => {
    if (!isItem(current)) return;
    if (canShare && navigator.canShare({ files: [current.file] })) {
      // Cancelling the share sheet rejects; the preview then stays.
      const sent = await navigator.share({ files: [current.file] }).then(() => true, () => false);
      if (sent) setOpen(false);
      return;
    }
    const link = document.createElement("a");
    link.href = current.url;
    link.download = current.file.name;
    link.click();
    setOpen(false);
  };

  const copy = async () => {
    if (!isItem(made) || copied) return;
    // The item is made inside the click, with the picture still to come, as Safari requires.
    const done = await navigator.clipboard.write([new ClipboardItem({ "image/png": asPNG(made.file) })]).then(() => true, () => false);
    if (!done) return;
    setCopied(true);
    window.setTimeout(() => setOpen(false), 900);
  };

  const begin = () => {
    setKind("picture");
    setFilmWanted(false);
    setOpen(true);
  };

  const chooseFilm = () => {
    setKind("video");
    if (inApp) return;
    if (film === "failed") setAttempt((count) => count + 1);
    setFilmWanted(true);
  };

  if (shared) return null;
  const Icon = canShare ? Share : Download;
  const making = filming && !isItem(film) && film !== "failed";
  const share = typeof film === "number" ? film : 0;
  const percent = `${Math.floor(share * 100)}%`;
  // Read out at the start, each quarter and the end, not at every percent.
  const announced = !filming ? "" : isItem(film) ? text.videoReady : film === "failed" ? text.videoFailed : text.makingVideo(`${Math.min(75, Math.floor(share * 4) * 25)}%`);
  const title = video ? text.shareVideo : text.open;
  const label = video ? (canShare ? text.shareVideo : text.saveVideo) : (canShare ? text.share : text.save);
  return (
    <>
      <button ref={trigger} type="button" className={`${styles.open} ${quiet ? styles.quiet : ""}`} onClick={begin} aria-label={title} title={title} aria-haspopup="dialog">
        <Share aria-hidden="true" />
      </button>
      {open && createPortal(
        <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={title}>
          <button type="button" className={styles.backdrop} onClick={() => setOpen(false)} aria-label={text.close} tabIndex={-1} />
          <div className={styles.frame} aria-busy={!ready}>
            {filming && isItem(film) ? (
              <video
                key={film.url}
                src={film.url}
                // The picture is the film's first and last frame, so it stands in until the film plays.
                poster={isItem(made) ? made.url : undefined}
                aria-label={film.file.name}
                muted
                loop
                playsInline
                autoPlay={!reduced}
                controls={reduced}
                // Muted before it may play: iOS plays a video inline on its own only then.
                ref={(element) => { if (element) element.muted = true; }}
              />
            ) : isItem(made) ? (
              // eslint-disable-next-line @next/next/no-img-element -- a picture made on this device
              <img src={made.url} alt={made.file.name} className={filming ? styles.behind : undefined} />
            ) : (
              <p className={`${styles.state} ${made ? "" : styles.making}`} aria-hidden={making || undefined}>
                {made === "failed" ? text.failed : making ? text.makingVideo(percent) : text.making}
              </p>
            )}
            {making && isItem(made) ? <p className={`${styles.state} ${styles.over}`} aria-hidden="true">{text.makingVideo(percent)}</p> : null}
            {making ? <span className={styles.progress} style={{ transform: `scaleX(${share})` }} aria-hidden="true" /> : null}
            {filming && film === "failed" ? <p className={`${styles.state} ${styles.over}`} aria-hidden="true">{text.videoFailed}</p> : null}
          </div>
          <div className={styles.actions}>
            {/* Outside the busy card, which would hold back what it says. */}
            <p className="visually-hidden" role="status">{announced}</p>
            {offerFilm ? (
              <div className={styles.kinds} role="group" aria-label={text.kinds}>
                <button type="button" aria-pressed={!video} onClick={() => setKind("picture")}>{text.picture}</button>
                <button type="button" aria-pressed={video} onClick={chooseFilm}>{text.video}</button>
              </div>
            ) : null}
            {inApp ? (
              <p className={styles.hint}>{video ? text.videoHold : text.hold}</p>
            ) : (
              <div className={styles.buttons}>
                <button ref={action} type="button" className={styles.primary} onClick={send} disabled={!ready}>
                  <Icon aria-hidden="true" />
                  {label}
                </button>
                {canCopy && !canShare && !video ? (
                  <button type="button" className={styles.secondary} onClick={copy} disabled={!isItem(made)}>
                    {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {copied ? text.copied : text.copy}
                  </button>
                ) : null}
              </div>
            )}
          </div>
          <button ref={closer} type="button" className={styles.close} onClick={() => setOpen(false)} aria-label={text.close}>
            <X aria-hidden="true" />
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
