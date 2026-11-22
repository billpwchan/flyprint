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

type Made = { url: string; file: File } | "failed" | null;

// A year, trip or flight as a picture to send: the button opens the card at
// full size, made on this device, with one button under it to share or save
// it. The share sheet opens from that second press, so it always has the
// gesture it needs even when making the picture took a while. Once the
// picture has gone somewhere the preview closes. Someone else's public page
// offers none: a visitor doesn't make posters of another person's travels.
export default function ShareCard({ request, quiet = false }: { request: CardRequest; quiet?: boolean }) {
  const { locale } = useLocale();
  const text = ui[locale].cards;
  const { flights, owner } = useArchive();
  const shared = useShared();
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<Made>(null);
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(subscribeNothing, shareSheetAvailable, () => false);
  const inApp = useSyncExternalStore(subscribeNothing, insideApp, () => false);
  const canCopy = useSyncExternalStore(subscribeNothing, clipboardTakesImages, () => false);
  const trigger = useRef<HTMLButtonElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const key = request.kind === "year" ? `year-${request.year ?? "all"}` : request.kind === "trip" ? `trip-${request.trip.id}` : `flight-${request.flight.id}`;

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
      if (url) URL.revokeObjectURL(url);
      setMade(null);
      setCopied(false);
    };
    // The card is made once per opening, for what the page shows then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, locale]);

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

  const send = async () => {
    if (!made || made === "failed") return;
    if (canShare && navigator.canShare({ files: [made.file] })) {
      // Cancelling the share sheet rejects; the preview then stays.
      const sent = await navigator.share({ files: [made.file] }).then(() => true, () => false);
      if (sent) setOpen(false);
      return;
    }
    const link = document.createElement("a");
    link.href = made.url;
    link.download = made.file.name;
    link.click();
    setOpen(false);
  };

  const copy = async () => {
    if (!made || made === "failed" || copied) return;
    // The item is made inside the click, with the picture still to come, as Safari requires.
    const done = await navigator.clipboard.write([new ClipboardItem({ "image/png": asPNG(made.file) })]).then(() => true, () => false);
    if (!done) return;
    setCopied(true);
    window.setTimeout(() => setOpen(false), 900);
  };

  if (shared) return null;
  const Icon = canShare ? Share : Download;
  const ready = !!made && made !== "failed";
  return (
    <>
      <button ref={trigger} type="button" className={`${styles.open} ${quiet ? styles.quiet : ""}`} onClick={() => setOpen(true)} aria-label={text.open} title={text.open} aria-haspopup="dialog">
        <Share aria-hidden="true" />
      </button>
      {open && createPortal(
        <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={text.open}>
          <button type="button" className={styles.backdrop} onClick={() => setOpen(false)} aria-label={text.close} tabIndex={-1} />
          <div className={styles.frame} aria-busy={!made}>
            {made && made !== "failed" ? (
              // eslint-disable-next-line @next/next/no-img-element -- a picture made on this device
              <img src={made.url} alt={made.file.name} />
            ) : (
              <p className={`${styles.state} ${made ? "" : styles.making}`}>{made === "failed" ? text.failed : text.making}</p>
            )}
          </div>
          <div className={styles.actions}>
            {inApp ? (
              <p className={styles.hint}>{text.hold}</p>
            ) : (
              <div className={styles.buttons}>
                <button ref={action} type="button" className={styles.primary} onClick={send} disabled={!ready}>
                  <Icon aria-hidden="true" />
                  {canShare ? text.share : text.save}
                </button>
                {canCopy && !canShare ? (
                  <button type="button" className={styles.secondary} onClick={copy} disabled={!ready}>
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
