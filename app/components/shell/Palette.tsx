"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, MapPin, Plane, Plus, Route, Search, UserRound } from "lucide-react";
import CityImage from "../common/CityImage";
import type { Flight } from "../../lib/data";
import { buildTrips, isAway } from "../../lib/trips";
import { yearCounts } from "../../lib/insights";
import { citiesIn } from "../../lib/footprint";
import { searchCities, searchFlights, searchTrips, tokensOf } from "../../lib/search";
import { cityOf, countryName, countryOf, metroOf } from "../../lib/places";
import { carrierName } from "../../lib/i18n";
import { formatDay, formatNumber, formatTripRange, ui } from "../../lib/copy";
import { tripTitle } from "../../lib/titles";
import { useLocale } from "../LocaleProvider";
import { planUi } from "../../lib/copy-plan";
import { useArchive, useViewer } from "../ArchiveProvider";
import { accountUi } from "../../lib/copy-account";
import { useStage } from "../stage/StageContext";
import CarrierMark from "../CarrierMark";
import styles from "./Palette.module.css";

const newestFirst = (a: Flight, b: Flight) => b.date.localeCompare(a.date) || b.depart.localeCompare(a.depart);

type Item = { key: string; kind: "year" | "city" | "trip" | "flight" | "import" | "account"; href: string; title: string; detail: string; flights: Flight[]; airline?: string; place?: string };
type Group = { title: string; items: Item[] };

// One field for everything in the archive: a year, a city, a trip, a flight.
// Moving through the results shows each one on the globe before it opens.
export default function Palette({ onClose, onGo }: { onClose: () => void; onGo: (href: string) => void }) {
  const { locale } = useLocale();
  const text = ui[locale];
  const { setPreview } = useStage();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { flights: list, all, ahead } = useArchive();
  // Trips and flights are searched whole, booked ones included.
  const trips = useMemo(() => buildTrips(all).filter(isAway), [all]);
  const waiting = useMemo(() => new Set(ahead.map((flight) => flight.id)), [ahead]);
  const cities = useMemo(() => citiesIn(list), [list]);
  const years = useMemo(() => yearCounts(list), [list]);
  const viewer = useViewer();
  const field = useRef<HTMLInputElement>(null);
  const listbox = useRef<HTMLDivElement>(null);

  const groups = useMemo<Group[]>(() => {
    const n = (value: number) => formatNumber(value, locale);
    const tripItem = (trip: (typeof trips)[number]): Item => ({ key: `trip:${trip.id}`, kind: "trip", href: `/trips/${encodeURIComponent(trip.id)}`, title: tripTitle(trip, locale), detail: formatTripRange(trip.start, trip.end, locale), flights: trip.flights, place: trip.destination });
    const cityItem = (code: string): Item => {
      const metro = metroOf(code), city = cities.get(metro);
      return { key: `city:${metro}`, kind: "city", href: `/places/${encodeURIComponent(metro)}`, title: cityOf(code, locale), detail: [countryName(countryOf(code), locale), city ? text.units.flights(n(city.arrivals)) : ""].filter(Boolean).join(" · "), flights: city?.flights ?? [], place: code };
    };
    const tokens = tokensOf(query);
    const words = accountUi[locale];
    const actions: Item[] = (viewer?.trial != null
      ? [
        { key: "action:import", kind: "import" as const, href: "/import", title: words.menu.import, detail: "", flights: [], match: "import upload 导入 匯入 上传 上載 航旅纵横 航旅縱橫 umetrip" },
        { key: "action:keep", kind: "account" as const, href: "/signup", title: words.trial.keep, detail: words.trial.line(n(viewer.trial)), flights: [], match: "sign up keep account 注册 註冊 保存 账户 帳戶" },
      ]
      : viewer
      ? [
        { key: "action:import", kind: "import" as const, href: "/import", title: words.menu.import, detail: "", flights: [], match: "import upload 导入 匯入 上传 上載 航旅纵横 航旅縱橫 umetrip" },
        { key: "action:settings", kind: "account" as const, href: "/settings", title: words.menu.settings, detail: viewer.email, flights: [], match: "account settings export password 账户 帳戶 设置 設定 导出 匯出 密码 密碼" },
      ]
      : [{ key: "action:signin", kind: "account" as const, href: "/login", title: words.menu.signIn, detail: words.menu.demoLine, flights: [], match: "sign in login account 登录 登入 账户 帳戶" }])
      .filter((item) => !tokens.length || tokens.every((token) => `${item.title} ${item.match}`.toLowerCase().includes(token.toLowerCase())))
      .map((item): Item => ({ key: item.key, kind: item.kind, href: item.href, title: item.title, detail: item.detail, flights: item.flights }));
    const actionGroup = { title: words.menu.account, items: actions };
    if (!tokens.length) {
      const booked = trips.filter((trip) => trip.flights.some((flight) => waiting.has(flight.id)));
      const coming = booked.slice().reverse().slice(0, 3).map(tripItem);
      const recent = trips.filter((trip) => !booked.includes(trip)).slice(0, 5).map(tripItem);
      const top = [...cities.values()].sort((a, b) => b.arrivals - a.arrivals).slice(0, 5).map((city) => cityItem(city.code));
      return [{ title: planUi[locale].ahead, items: coming }, { title: text.search.recent, items: recent }, { title: text.search.cities, items: top }, actionGroup].filter((group) => group.items.length);
    }
    const yearItems: Item[] = years
      .filter((entry) => tokens.length === 1 && /^\d{2,4}$/.test(tokens[0]) && String(entry.year).includes(tokens[0]))
      .reverse()
      .slice(0, 3)
      .map((entry) => ({ key: `year:${entry.year}`, kind: "year", href: `/?year=${entry.year}`, title: text.meta.years(entry.year), detail: text.units.flights(n(entry.count)), flights: list.filter((flight) => flight.year === entry.year) }));
    const cityItems = searchCities(new Set(all.flatMap((flight) => [flight.origin, flight.destination])), query).slice(0, 4).map(cityItem);
    const tripItems = searchTrips(trips, query).slice(0, 5).map(tripItem);
    const flightItems = [...searchFlights(all, query)].sort(newestFirst).slice(0, 6).map((flight): Item => ({
      key: `flight:${flight.id}`, kind: "flight", href: `/flights/${encodeURIComponent(flight.id)}`,
      title: `${flight.flight}  ${cityOf(flight.origin, locale)} → ${cityOf(flight.destination, locale)}`,
      detail: `${formatDay(flight.date, locale)} · ${carrierName(flight.airline, locale)}`,
      flights: [flight], airline: flight.airline,
    }));
    return [
      { title: text.search.years, items: yearItems },
      { title: text.search.cities, items: cityItems },
      { title: text.search.trips, items: tripItems },
      { title: text.search.flights, items: flightItems },
      actionGroup,
    ].filter((group) => group.items.length);
  }, [query, locale, trips, cities, years, list, all, waiting, text, viewer]);

  const items = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const current = items[Math.min(active, items.length - 1)] ?? null;

  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  // Focus starts in the field, stays inside the dialog, and goes back to
  // whatever opened it when the dialog closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    field.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const stops = [...dialog.current.querySelectorAll<HTMLElement>("input, button:not([tabindex='-1'])")];
      const index = stops.indexOf(document.activeElement as HTMLElement);
      const next = stops[(index + (event.shiftKey ? -1 : 1) + stops.length) % stops.length];
      if (next) { event.preventDefault(); next.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => { setPreview(current?.flights.length ? current.flights : null); }, [current, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);
  useEffect(() => {
    listbox.current?.querySelector(`[data-key="${CSS.escape(current?.key ?? "")}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (Math.min(index, items.length - 1) + step + items.length) % items.length);
    }
    if (event.key === "Enter" && current) { event.preventDefault(); onGo(current.href); }
  };

  const icon = (kind: Item["kind"]) => kind === "import" ? <Plus aria-hidden="true" /> : kind === "account" ? <UserRound aria-hidden="true" /> : kind === "year" ? <CalendarDays aria-hidden="true" /> : kind === "city" ? <MapPin aria-hidden="true" /> : kind === "trip" ? <Route aria-hidden="true" /> : <Plane aria-hidden="true" />;

  return (
    <div className={styles.backdrop} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-label={text.search.open}>
        <label className={styles.field}>
          <Search aria-hidden="true" />
          <input
            ref={field}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={onKey}
            placeholder={text.search.placeholder}
            aria-label={text.search.open}
            aria-controls="palette-results"
            aria-activedescendant={current ? `palette-${current.key}` : undefined}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
          />
          <button type="button" className={styles.close} onClick={onClose}>{text.search.close}</button>
        </label>
        <div ref={listbox} id="palette-results" className={styles.results} role="listbox" aria-label={text.search.open}>
          {groups.length ? groups.map((group, groupIndex) => (
            <div key={group.title} className={styles.group} role="group" aria-labelledby={`palette-group-${groupIndex}`}>
              <h3 id={`palette-group-${groupIndex}`}>{group.title}</h3>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  id={`palette-${item.key}`}
                  data-key={item.key}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={current?.key === item.key}
                  className={styles.item}
                  onPointerMove={() => { const index = items.indexOf(item); if (index !== active) setActive(index); }}
                  onClick={() => onGo(item.href)}
                >
                  {item.place ? <CityImage code={item.place} className={styles.place} fallback={icon(item.kind)} /> : <span className={styles.icon}>{item.airline ? <CarrierMark airline={item.airline} size={16} /> : icon(item.kind)}</span>}
                  <span className={styles.label}>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                </button>
              ))}
            </div>
          )) : <p className={styles.empty}>{text.search.none(query.trim())}</p>}
        </div>
        <footer className={styles.hints} aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd>{text.search.move}</span>
          <span><kbd>↵</kbd>{text.search.go}</span>
          <span><kbd>esc</kbd>{text.search.close}</span>
        </footer>
      </div>
    </div>
  );
}
