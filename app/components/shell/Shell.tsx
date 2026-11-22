"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Search, UserRound } from "lucide-react";
import MapStage from "../stage/MapStage";
import { StageProvider, useStage } from "../stage/StageContext";
import { useLocale } from "../LocaleProvider";
import BrandMark from "../BrandMark";
import { formatNumber, ui } from "../../lib/copy";
import { brandName, localeOptions, type Locale } from "../../lib/i18n";
import { useArchive, useViewer } from "../ArchiveProvider";
import { toneColor } from "../../lib/palette";
import { accountUi } from "../../lib/copy-account";
import { publicUi } from "../../lib/copy-public";
import { call, reload } from "../account/api";
import { arrive, rememberScroll, scrollFor } from "./navigation";
import { useBrowsedYear } from "./address";
import Palette from "./Palette";
import styles from "./Shell.module.css";

// The three parts the app has: the trips, the flights one by one, and the
// footprint (how much, how far, which places, what carried you).
const sections = [
  { href: "/", key: "trips", match: (path: string) => path === "/" || path.startsWith("/trips") },
  { href: "/log", key: "log", match: (path: string) => path === "/log" || path.startsWith("/log/") || path.startsWith("/flights") },
  { href: "/places", key: "places", match: (path: string) => path.startsWith("/places") || path.startsWith("/fleet") || path.startsWith("/airlines") },
] as const;

const PHONE = "(max-width: 760px)";
// Screens with forms open the phone sheet all the way.
const FORMS = /^\/(login|signup|import|settings|join)(\/|$)/;

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <StageProvider>
      <ShellFrame>{children}</ShellFrame>
    </StageProvider>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const text = ui[locale];
  const year = useBrowsedYear();
  const [searching, setSearching] = useState(false);
  const { panel, scroller, screen, grip } = usePanel(pathname);
  const scrolled = useScrolled(scroller, pathname);
  useSearchKeys(setSearching);
  useArrival();

  // Choosing the section already on screen returns to its top, the way a tab
  // bar does, and drops a search the address still carries.
  const reselect = (event: React.MouseEvent, href: string) => {
    if (pathname !== href || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.current?.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
    window.dispatchEvent(new Event("flyprint:reselect"));
  };

  const brand = (
    <Link href="/" className={styles.brand} aria-label={brandName[locale]}>
      <BrandMark size={22} />
      <span>{brandName[locale]}</span>
    </Link>
  );

  return (
    <div className={styles.shell}>
      <div className={styles.stage}><MapStage /></div>

      <header className={styles.chrome}>
        <div className={styles.phoneOnly}>{brand}</div>
        <div className={styles.tools}>
          <button type="button" className={styles.search} onClick={() => setSearching(true)} aria-label={text.search.open} aria-keyshortcuts="Meta+K">
            <Search aria-hidden="true" />
            <span>{text.search.open}</span>
            <kbd aria-hidden="true">⌘K</kbd>
          </button>
          <LanguageSwitch locale={locale} onChange={setLocale} label={text.language} />
          <AccountMenu locale={locale} onLocale={setLocale} />
        </div>
      </header>

      <div ref={panel} className={styles.panel}>
        <div ref={grip} className={styles.grip}>
          <button type="button" className={styles.handle} aria-label={text.sheet} />
          <div className={styles.panelHead}>
            {brand}
          </div>
          {pathname.startsWith("/s/") ? null : <nav className={styles.tabs} aria-label={text.nav.label}>
            {sections.map((section) => {
              const active = section.match(pathname);
              const href = section.href;
              return (
                <Link
                  key={section.href}
                  href={year ? `${href}?year=${year}` : href}
                  aria-current={active ? "page" : undefined}
                  onClick={(event) => reselect(event, href)}
                >
                  {text.nav[section.key]}
                </Link>
              );
            })}
          </nav>}
        </div>
        <div className={styles.edge} data-shown={scrolled ? "true" : undefined} aria-hidden="true" />
        <main ref={scroller} className={styles.scroller} data-scroll-root>
          <div ref={screen} key={pathname} className={styles.screen}>{children}</div>
        </main>
      </div>

      {searching ? <Palette onClose={() => setSearching(false)} onGo={(href) => { setSearching(false); router.push(href); }} /> : null}
    </div>
  );
}

// A link from a post carries ?ref=. Reported once per page load, from the
// browser, so link-preview fetchers that run no script are not counted.
function useArrival() {
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (!ref) return;
    fetch("/api/arrive", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref }), keepalive: true }).catch(() => {});
  }, []);
}

// Whether the panel has scrolled off its top, so what passes under the tabs
// fades instead of being cut. Set only when it changes.
function useScrolled(scroller: React.RefObject<HTMLElement | null>, pathname: string) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const update = () => setScrolled(element.scrollTop > 2);
    update();
    element.addEventListener("scroll", update, { passive: true });
    return () => element.removeEventListener("scroll", update);
  }, [scroller, pathname]);
  return scrolled;
}

function LanguageSwitch({ locale, onChange, label }: { locale: Locale; onChange: (locale: Locale) => void; label: string }) {
  return (
    <div className={styles.languageRow} role="group" aria-label={label}>
      {localeOptions.map((option) => (
        <button key={option.value} type="button" lang={option.value} aria-pressed={locale === option.value} onClick={() => onChange(option.value)} title={option.label}>{option.short}</button>
      ))}
    </div>
  );
}

// Who is reading. Signed out it is a word to sign in; signed in, a mark with
// the reader's initial that opens their account. On a phone the language
// choice moves into the same menu to keep the bar to three controls.
function AccountMenu({ locale, onLocale }: { locale: Locale; onLocale: (locale: Locale) => void }) {
  const viewer = useViewer();
  const { links } = useArchive();
  const text = accountUi[locale];
  const words = ui[locale];
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) { setShownFor(pathname); setOpen(false); }
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      host.current?.querySelector<HTMLElement>("button[aria-haspopup]")?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [open]);
  const here = pathname === "/login" || pathname === "/signup" ? "/" : pathname;
  const signOut = async () => { await call("/api/auth/logout", { method: "POST" }); reload("/"); };
  // Ending a trial deletes it, so it asks twice.
  const [ending, setEnding] = useState(false);
  if (!open && ending) setEnding(false);
  // A trial has no name yet: it shows as the visitor's figure, with its own menu.
  const trial = viewer?.trial ?? null;
  const initial = viewer && trial === null ? (Array.from(viewer.name.trim())[0] ?? "·").toUpperCase() : "";
  return (
    <div ref={host} className={styles.account} data-signed={viewer ? "in" : "out"}>
      {viewer ? null : <Link href={`/login${here !== "/" ? `?next=${encodeURIComponent(here)}` : ""}`} className={styles.signIn}>{text.menu.signIn}</Link>}
      <button type="button" className={styles.avatar} aria-haspopup="menu" aria-expanded={open} aria-label={viewer ? `${text.menu.account}: ${viewer.name}` : text.menu.account} onClick={() => setOpen(!open)}>
        {initial ? <span>{initial}</span> : <UserRound aria-hidden="true" />}
        {viewer?.invites ? <b className={styles.badge} aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div className={styles.menu} role="menu" aria-label={text.menu.account}>
          {trial !== null ? (
            <>
              <div className={styles.who}><strong>{text.trial.name}</strong><span>{text.trial.line(formatNumber(trial, locale))}</span></div>
              <Link role="menuitem" href="/signup">{text.trial.keep}</Link>
              <Link role="menuitem" href="/import">{text.menu.import}</Link>
              <Link role="menuitem" href={`/login${here !== "/" ? `?next=${encodeURIComponent(here)}` : ""}`}>{text.menu.signIn}</Link>
              <button role="menuitem" type="button" onClick={() => ending ? signOut() : setEnding(true)}>{ending ? text.trial.endSure : text.trial.end}</button>
            </>
          ) : viewer ? (
            <>
              <div className={styles.who}><strong>{viewer.name}</strong><span>{viewer.email}</span></div>
              {links.map((link) => (
                <Link key={link.id} role="menuitem" href={`/with/${encodeURIComponent(link.id)}`} className={styles.person} style={{ "--tone": toneColor(link.tone) } as React.CSSProperties}>
                  <i aria-hidden="true" />{words.pair.title(link.name)}<small>{formatNumber(link.together, locale)}</small>
                </Link>
              ))}
              {viewer.invites ? <Link role="menuitem" href="/settings#links" className={styles.invites}>{text.menu.invites(formatNumber(viewer.invites, locale))}</Link> : null}
              <Link role="menuitem" href="/import">{text.menu.import}</Link>
              <Link role="menuitem" href="/settings#share">{publicUi[locale].share.entry}</Link>
              <Link role="menuitem" href="/settings">{text.menu.settings}</Link>
              <button role="menuitem" type="button" onClick={signOut}>{text.menu.signOut}</button>
            </>
          ) : (
            <>
              <Link role="menuitem" href={`/login${here !== "/" ? `?next=${encodeURIComponent(here)}` : ""}`}>{text.menu.signIn}</Link>
              <Link role="menuitem" href="/signup">{text.menu.signUp}</Link>
              {links.map((link) => (
                <Link key={link.id} role="menuitem" href={`/with/${encodeURIComponent(link.id)}`} className={styles.person} style={{ "--tone": toneColor(link.tone) } as React.CSSProperties}>
                  <i aria-hidden="true" />{text.menu.sample}
                </Link>
              ))}
            </>
          )}
          <div className={styles.menuLanguages} role="group" aria-label={text.menu.language}>
            {localeOptions.map((option) => (
              <button key={option.value} type="button" role="menuitemradio" aria-checked={locale === option.value} lang={option.value} onClick={() => { onLocale(option.value); setOpen(false); }}>{option.label}</button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ⌘K opens search anywhere; "/" too, unless the page has its own search field.
function useSearchKeys(open: (value: boolean) => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]");
      const command = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      const slash = event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!command && !slash) return;
      event.preventDefault();
      const field = slash ? document.getElementById("log-search") as HTMLInputElement | null : null;
      if (field) { field.focus(); field.select(); } else open(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

// The panel's list scrolls inside the panel. Moving to a new screen starts at
// its top; going back returns to where the reader was. A new screen slides in
// from the side it came from.
//
// On a phone the panel is a sheet over the globe with three resting heights:
// a peek that leaves the globe to itself, half, and full. It follows the
// finger and settles where the flick was heading. On a desktop it is a card
// at the left, and the globe centres in the space to its right.
function usePanel(pathname: string) {
  const panel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const grip = useRef<HTMLDivElement>(null);
  const { setInset } = useStage();

  useEffect(() => {
    window.history.scrollRestoration = "manual";
  }, []);

  useLayoutEffect(() => {
    const returning = arrive(pathname);
    if (screen.current) screen.current.dataset.enter = returning ? "back" : "forward";
    const top = returning ? scrollFor(pathname) : 0;
    const element = scroller.current;
    if (!element) return;
    element.scrollTop = top;
    // The screen being returned to can mount a frame or two later than the
    // address changes; keep placing it until it is tall enough, unless the
    // reader starts scrolling first.
    let frame = 0, cancelled = false;
    const started = performance.now();
    const stop = () => { cancelled = true; };
    const settle = () => {
      if (cancelled) return;
      if (Math.abs(element.scrollTop - top) > 1) element.scrollTop = top;
      if (Math.abs(element.scrollTop - top) > 1 && performance.now() - started < 1000) frame = requestAnimationFrame(settle);
    };
    frame = requestAnimationFrame(settle);
    element.addEventListener("wheel", stop, { passive: true, once: true });
    element.addEventListener("touchstart", stop, { passive: true, once: true });
    return () => { cancelAnimationFrame(frame); element.removeEventListener("wheel", stop); element.removeEventListener("touchstart", stop); };
  }, [pathname]);

  useEffect(() => {
    const element = scroller.current;
    const save = () => rememberScroll(element?.scrollTop ?? 0);
    element?.addEventListener("scroll", save, { passive: true });
    return () => element?.removeEventListener("scroll", save);
  }, []);

  useEffect(() => {
    const sheet = panel.current, handle = grip.current, list = scroller.current;
    if (!sheet || !handle || !list) return;
    const query = window.matchMedia(PHONE);
    let detent = 1, offset = 0;

    const stops = () => {
      const height = sheet.offsetHeight, viewport = window.innerHeight;
      const peek = Math.min(Math.round(viewport * 0.3), 250);
      const half = Math.round(viewport * 0.54);
      return [Math.max(0, height - peek), Math.max(0, height - half), 0];
    };
    const report = () => {
      if (query.matches) {
        const top = document.querySelector(`.${styles.chrome}`)?.getBoundingClientRect().bottom ?? 56;
        setInset({ top: Math.round(top), right: 0, bottom: Math.round(sheet.offsetHeight - offset), left: 0 });
      } else {
        setInset({ top: 0, right: 0, bottom: 0, left: Math.round(sheet.getBoundingClientRect().right) });
      }
    };
    const place = (y: number, animate: boolean) => {
      offset = y;
      sheet.style.transition = animate ? "" : "none";
      sheet.style.transform = `translate3d(0, ${y}px, 0)`;
      // The list can reach its end while part of the sheet is below the screen.
      list.style.paddingBottom = `calc(${y}px + env(safe-area-inset-bottom))`;
    };
    const rest = (index: number) => {
      detent = index;
      place(stops()[index], true);
      sheet.dataset.detent = ["peek", "half", "full"][index];
      sheet.querySelector(`.${styles.handle}`)?.setAttribute("aria-expanded", String(index === 2));
      report();
    };
    const apply = () => {
      if (query.matches) rest(detent);
      else { offset = 0; sheet.style.transform = ""; sheet.style.transition = ""; list.style.paddingBottom = ""; delete sheet.dataset.detent; report(); }
    };
    apply();
    const onSheet = (event: Event) => { if (query.matches) rest((event as CustomEvent<number>).detail); };
    window.addEventListener("flyprint:sheet", onSheet);
    query.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    const observer = new ResizeObserver(() => { if (!query.matches) report(); });
    observer.observe(sheet);

    let drag: { start: number; from: number; last: number; time: number; velocity: number; mode: "sheet" | "scroll" | null; viaList: boolean; pointer?: number } | null = null;
    // A drag is not also a tap on whatever it started on: the handle, or a tab
    // the browser snapped the touch to.
    let dragged = false;
    const begin = (y: number, viaList: boolean, pointer?: number) => {
      drag = { start: y, from: offset, last: y, time: performance.now(), velocity: 0, mode: null, viaList, pointer };
    };
    const move = (y: number, event: Event) => {
      if (!drag || !query.matches) return;
      if (drag.mode === null) {
        const dy = y - drag.start;
        if (Math.abs(dy) < 6) return;
        // From the head the sheet always moves. From the list: up while the
        // sheet can still rise, or down from the top of the list.
        drag.mode = !drag.viaList || (detent !== 2 && dy < 0) || (list.scrollTop <= 0 && dy > 0) ? "sheet" : "scroll";
        drag.start = y;
        if (drag.mode === "sheet") {
          dragged = true;
          if (drag.pointer !== undefined) handle.setPointerCapture(drag.pointer);
        }
      }
      if (drag.mode !== "sheet") return;
      if (event.cancelable) event.preventDefault();
      const max = stops()[0];
      const raw = drag.from + (y - drag.start);
      // Past either end the sheet resists instead of stopping dead.
      const next = raw < 0 ? raw / 4 : raw > max ? max + (raw - max) / 4 : raw;
      const now = performance.now();
      drag.velocity = (y - drag.last) / Math.max(1, now - drag.time);
      drag.last = y;
      drag.time = now;
      place(next, false);
    };
    const end = () => {
      if (!drag) return;
      const wasSheet = drag.mode === "sheet", velocity = drag.velocity;
      drag = null;
      if (!wasSheet) return;
      const targets = stops();
      const projected = offset + velocity * 220;
      let best = 0;
      targets.forEach((stop, index) => { if (Math.abs(stop - projected) < Math.abs(targets[best] - projected)) best = index; });
      rest(best);
    };

    const onPointerDown = (event: PointerEvent) => {
      dragged = false;
      if (!query.matches || (event.pointerType === "mouse" && event.button !== 0)) return;
      begin(event.clientY, false, event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => move(event.clientY, event);
    const onPointerUp = () => end();
    const onTap = (event: MouseEvent) => {
      if (dragged) {
        dragged = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // The handle is a button, so a tap, Enter or Space all open or settle the sheet.
      if (query.matches && (event.target as HTMLElement).closest(`.${styles.handle}`)) rest(detent === 2 ? 1 : 2);
    };
    const onTouchStart = (event: TouchEvent) => begin(event.touches[0].clientY, true);
    const onTouchMove = (event: TouchEvent) => { if (drag?.viaList) move(event.touches[0].clientY, event); };
    const onTouchEnd = () => { if (drag?.viaList) end(); };

    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);
    handle.addEventListener("click", onTap, true);
    list.addEventListener("touchstart", onTouchStart, { passive: true });
    list.addEventListener("touchmove", onTouchMove, { passive: false });
    list.addEventListener("touchend", onTouchEnd);
    list.addEventListener("touchcancel", onTouchEnd);
    return () => {
      query.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("flyprint:sheet", onSheet);
      observer.disconnect();
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerUp);
      handle.removeEventListener("click", onTap, true);
      list.removeEventListener("touchstart", onTouchStart);
      list.removeEventListener("touchmove", onTouchMove);
      list.removeEventListener("touchend", onTouchEnd);
      list.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [setInset]);

  useEffect(() => {
    if (FORMS.test(pathname)) window.dispatchEvent(new CustomEvent("flyprint:sheet", { detail: 2 }));
  }, [pathname]);

  return { panel, scroller, screen, grip };
}
