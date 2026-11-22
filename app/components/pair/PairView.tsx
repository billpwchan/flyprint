"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { registerAtlas } from "../../lib/atlas";
import type { Flight, Link as Linked, Pair, Sharing } from "../../lib/data";
import { cityPairs, summarize, yearCounts } from "../../lib/insights";
import { citiesIn, type City } from "../../lib/footprint";
import { buildTrips } from "../../lib/trips";
import { cityOf, metroOf } from "../../lib/places";
import { pathPoints } from "../../lib/network";
import { palette, toneColor } from "../../lib/palette";
import { formatDate, formatDuration, formatMonth, formatNumber, ui } from "../../lib/copy";
import { accountUi, errorText } from "../../lib/copy-account";
import type { Locale } from "../../lib/i18n";
import { useLocale } from "../LocaleProvider";
import { hasLanded, nextTogether } from "../../lib/plan";
import { isHomeOn, wasHome } from "../../lib/residence";
import { useArchive, useClock, useLandedBy } from "../ArchiveProvider";
import TogetherNext from "../plan/TogetherNext";
import { useScene, useStage, type Scene } from "../stage/StageContext";
import { useYearParam } from "../shell/address";
import { Figures, Lens, useTitle } from "../common/Lens";
import Readings, { type Reading } from "../common/Readings";
import TripRow from "../common/TripRow";
import DetailHead from "../common/Pager";
import { usePin } from "../common/usePin";
import { call } from "../account/api";
import common from "../common/common.module.css";
import styles from "./Pair.module.css";

const MAX_PLACES = 6;
const ascending = (a: Flight, b: Flight) => a.date.localeCompare(b.date) || a.depart.localeCompare(b.depart);
const tone = (color: string) => ({ "--tone": color }) as React.CSSProperties;

// The page two linked people share: the flights both of them logged, what
// those add up to, and the trips they were part of. When both share every
// route, the globe can also lay each one's own flights over the shared ones.
export default function PairView({ id, pair, year }: { id: string; pair: Pair | null; year: number | null }) {
  return pair ? <PairPage id={id} pair={pair} serverYear={year} /> : <Missing />;
}

function Missing() {
  const { locale } = useLocale();
  const text = ui[locale];
  const { flights } = useArchive();
  useTitle(text.pair.notFound);
  useScene(useMemo<Scene>(() => ({ flights, focus: null, camera: { kind: "world" }, cameraKey: "with:missing" }), [flights]));
  return (
    <div className={common.detail}>
      <DetailHead backHref="/" backLabel={text.nav.trips} previous={null} next={null} />
      <h1 className={common.headline}>{text.pair.notFound}</h1>
      <p className={common.lead}>{text.pair.notFoundLead}</p>
    </div>
  );
}

function PairPage({ id, pair, serverYear }: { id: string; pair: Pair; serverYear: number | null }) {
  registerAtlas(pair.atlas);
  const { locale } = useLocale();
  const text = ui[locale];
  const { setPreview } = useStage();
  const { owner, flights: mine, asOf } = useArchive();
  const other = pair.other;
  // Either one's flights count once they have landed, like everywhere else.
  const landedBy = useLandedBy(pair.flights, asOf);
  const pairFlights = useMemo(() => pair.flights.filter((flight) => hasLanded(flight, landedBy)), [pair.flights, landedBy]);
  const [year, setYear] = useYearParam(`/with/${id}`, serverYear);
  const [view, setView] = useState<"together" | "all">("together");
  const everything = pair.overlay && view === "all";

  const shared = useMemo(() => pairFlights.filter((flight) => flight.side === "both"), [pairFlights]);
  const counts = useMemo(() => yearCounts(shared), [shared]);
  const list = useMemo(() => year ? shared.filter((flight) => flight.year === year) : shared, [shared, year]);
  const summary = useMemo(() => summarize(list), [list]);
  const cityCount = useMemo(() => citiesIn(list).size, [list]);
  const trips = useMemo(() => buildTrips(mine).filter((trip) => (!year || trip.year === year) && trip.flights.some((flight) => flight.with?.includes(other.id))), [mine, other.id, year]);
  const readings = useMemo(() => pairReadings({ ...pair, flights: pairFlights }, list, year, locale), [pair, pairFlights, list, year, locale]);
  // A trip's legs flown together light up as shared, like everywhere else on this page.
  const previewTrip = (flights: Flight[] | null) => setPreview(flights?.map((flight) => flight.with?.includes(other.id) ? { ...flight, side: "both" as const } : flight) ?? null);
  const [pinned, setPinned] = usePin(`with:${id}:${year ?? "all"}`);
  const pinnedReading = readings.find((reading) => reading.key === pinned) ?? null;
  useTitle(text.pair.title(other.name));

  const colors = useMemo(() => ({ me: toneColor(owner.tone), both: palette.together, them: toneColor(other.tone) }), [owner.tone, other.tone]);
  // Meeting at either one's home is just coming home, so it does not count.
  const clock = useClock();
  const sides = useMemo(() => [pair.flights.filter((flight) => flight.side !== "them"), pair.flights.filter((flight) => flight.side !== "me")], [pair.flights]);
  const together = useMemo(() => nextTogether(pair.flights, clock, (code, date) => sides.some((list) => isHomeOn(list, date, code))), [pair.flights, clock, sides]);
  const showTogether = together && (!year || Number(together.date.slice(0, 4)) === year);
  const scene = useMemo<Scene>(() => {
    const yearFlights = year && list.length ? list : null;
    return {
      flights: everything ? pairFlights : shared,
      focus: pinnedReading?.flights ?? yearFlights,
      colors,
      camera: pinnedReading && pinnedReading.frame !== false
        ? { kind: "fit", points: pathPoints(pinnedReading.flights), maxZoom: 5.5 }
        : { kind: "world", around: pinnedReading?.flights ?? yearFlights ?? undefined },
      cameraKey: `with:${id}:${year ?? "all"}:${pinnedReading?.key ?? ""}`,
    };
  }, [everything, pairFlights, shared, year, list, pinnedReading, colors, id]);
  useScene(scene);

  const n = (value: number) => formatNumber(value, locale);
  return (
    <Lens ownFlights={false} counts={counts} year={year} onYear={setYear} onPreviewYear={(value) => setPreview(value ? shared.filter((flight) => flight.year === value) : null)}>
      <p className={styles.kicker}>
        <span className={styles.duo} aria-hidden="true"><i style={tone(colors.me)} /><i style={tone(colors.them)} /></span>
        {text.pair.title(other.name)}
      </p>
      {showTogether ? <TogetherNext together={together} other={other} colors={colors} locale={locale} onPreview={setPreview} /> : null}
      {list.length ? (
        <>
          <h1 className={common.headline}>{year ? text.pair.yearHero(year, other.name, n(list.length)) : text.pair.hero(other.name, n(list.length))}</h1>
          <Figures items={[
            { value: n(summary.km), label: text.figures.km },
            { value: n(Math.round(summary.minutes / 60)), label: text.figures.hours },
            { value: n(cityCount), label: text.figures.cities },
            { value: n(summary.countries), label: text.figures.countries },
          ]} />
        </>
      ) : (
        <>
          <h1 className={common.headline}>{year ? text.pair.yearNone(year) : text.pair.none(other.name)}</h1>
          {year ? null : <p className={common.lead}>{text.pair.noneLead}</p>}
          {!year && !mine.length && !pair.demo ? <Link href="/import" className={common.emptyAction}><Plus aria-hidden="true" />{accountUi[locale].empty.action}</Link> : null}
        </>
      )}

      {pair.overlay ? (
        <div className={styles.view}>
          <div className={styles.switcher} role="group" aria-label={text.pair.view}>
            <button type="button" aria-pressed={view === "together"} onClick={() => setView("together")}><i style={tone(palette.together)} />{text.pair.together}</button>
            <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")}><i style={tone(colors.me)} /><i style={tone(colors.them)} />{text.pair.everything}</button>
          </div>
          {everything ? (
            <p className={styles.legend}>
              <span><i style={tone(colors.me)} />{text.pair.me}</span>
              <span><i style={tone(colors.them)} />{other.name}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {readings.length ? <Readings readings={readings} pinned={pinned} onPin={setPinned} onPreview={setPreview} label={text.readings.title} /> : null}

      {trips.length ? (
        <section className={styles.trips} aria-labelledby="pair-trips">
          <h2 id="pair-trips" className={common.sectionTitle}>{text.pair.trips}</h2>
          <ol>
            {trips.map((trip) => {
              const together = trip.flights.filter((flight) => flight.with?.includes(other.id)).length;
              return <TripRow key={trip.id} trip={trip} locale={locale} onPreview={previewTrip} withYear={!year} note={together < trip.flights.length ? text.pair.tripShare(together, trip.flights.length) : ""} />;
            })}
          </ol>
        </section>
      ) : null}

      {pair.demo ? null : <SharingControls other={other} />}
    </Lens>
  );
}

// Findings about the two of them, each one able to show its flights on the
// globe. Who got where first needs both people's routes, so it appears only
// when both share them.
function pairReadings(pair: Pair, list: Flight[], year: number | null, locale: Locale): Reading[] {
  const text = ui[locale];
  const n = (value: number) => formatNumber(value, locale);
  const city = (code: string) => cityOf(code, locale);
  const places = (codes: string[]) => {
    const names = [...new Set(codes.map(city))];
    return names.length > MAX_PLACES ? text.readings.listMore(names.slice(0, MAX_PLACES)) : text.readings.list(names);
  };
  const route = (flight: Flight) => `${city(flight.origin)}—${city(flight.destination)}`;
  const readings: Reading[] = [];

  // The first time is the first time ever; a year's first flight together is not news.
  const first = year ? null : [...list].sort(ascending)[0];
  if (first) readings.push({ key: "first", title: text.pair.first(formatDate(first.date, locale)), detail: `${route(first)} · ${first.flight}`, flights: [first] });

  const [top] = cityPairs(list);
  if (top && top.count > 1) readings.push({ key: "route", title: text.pair.route(city(top.a), city(top.b), n(top.count)), detail: "", flights: list.filter((flight) => top.ids.includes(flight.id)) });

  const visited = [...citiesIn(list).values()].sort((a, b) => b.arrivals - a.arrivals || a.first.localeCompare(b.first));
  if (visited.length > 2) readings.push({ key: "cities", title: text.pair.cities(n(visited.length)), detail: places(visited.map((entry) => entry.code)), flights: list, frame: false });

  const longest = list.reduce<Flight | null>((best, flight) => !best || flight.km > best.km ? flight : best, null);
  if (longest && list.length > 1) {
    readings.push({ key: "farthest", title: text.pair.farthest(n(longest.km)), detail: text.readings.longestDetail(route(longest), formatMonth(longest.date, locale), formatDuration(longest.durationMinutes, locale)), flights: [longest] });
  }

  if (pair.overlay && !year) {
    const mineFlights = pair.flights.filter((flight) => flight.side !== "them");
    const theirFlights = pair.flights.filter((flight) => flight.side !== "me");
    const mineCities = citiesIn(mineFlights);
    const theirCities = citiesIn(theirFlights);
    // Where either one has lived is not somewhere they got to first.
    const lived = (metro: string) => wasHome(mineFlights, mineCities.get(metro)?.code ?? metro) || wasHome(theirFlights, theirCities.get(metro)?.code ?? metro);
    const common = [...mineCities.keys()].filter((metro) => theirCities.has(metro) && !lived(metro));
    const mineFirst = common.filter((metro) => mineCities.get(metro)!.first < theirCities.get(metro)!.first);
    const theirsFirst = common.filter((metro) => theirCities.get(metro)!.first < mineCities.get(metro)!.first);
    if (common.length > 1 && mineFirst.length + theirsFirst.length) {
      const byArrivals = (cities: Map<string, City>) => (a: string, b: string) => cities.get(b)!.arrivals - cities.get(a)!.arrivals;
      readings.push({
        key: "ahead",
        title: text.pair.ahead(n(common.length), n(mineFirst.length)),
        detail: theirsFirst.length ? text.pair.aheadDetail(pair.other.name, places(theirsFirst.sort(byArrivals(theirCities)).map((metro) => theirCities.get(metro)!.code))) : "",
        flights: [...mineFirst.map((metro) => mineCities.get(metro)!.flights[0]), ...theirsFirst.map((metro) => theirCities.get(metro)!.flights[0])],
        frame: false,
      });
    }
    const onlyMine = [...mineCities.keys()].filter((metro) => !theirCities.has(metro)).sort((a, b) => mineCities.get(b)!.arrivals - mineCities.get(a)!.arrivals);
    const onlyTheirs = [...theirCities.keys()].filter((metro) => !mineCities.has(metro));
    if (onlyMine.length || onlyTheirs.length) {
      const apart = new Set([...onlyMine, ...onlyTheirs]);
      readings.push({
        key: "apart",
        title: text.pair.apart(n(onlyMine.length), pair.other.name, n(onlyTheirs.length)),
        detail: onlyMine.length ? text.pair.apartDetail(places(onlyMine.map((metro) => mineCities.get(metro)!.code)))
          : text.pair.apartDetail(places(onlyTheirs.map((metro) => theirCities.get(metro)!.code)), pair.other.name),
        flights: pair.flights.filter((flight) => flight.side !== "both" && (apart.has(metroOf(flight.origin)) || apart.has(metroOf(flight.destination)))),
        frame: false,
      });
    }
  }
  return readings;
}


// What this reader lets the other see, and the way out of the link.
function SharingControls({ other }: { other: Linked }) {
  const router = useRouter();
  const { locale } = useLocale();
  const text = ui[locale].pair;
  const account = accountUi[locale];
  const [mine, setMine] = useState<{ value: Sharing; from: Sharing }>({ value: other.mine, from: other.mine });
  if (mine.from !== other.mine) setMine({ value: other.mine, from: other.mine });
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = async (all: boolean) => {
    const value: Sharing = all ? "all" : "together";
    setMine((current) => ({ ...current, value }));
    setBusy(true);
    setError(null);
    const result = await call("/api/links", { body: { action: "share", with: other.id, shares: value } });
    setBusy(false);
    if (!result.ok) { setError(result.error); setMine((current) => ({ ...current, value: current.from })); return; }
    router.refresh();
  };
  const unlink = async () => {
    if (!armed) { setArmed(true); return; }
    setBusy(true);
    const result = await call("/api/links", { body: { action: "unlink", with: other.id } });
    if (!result.ok) { setBusy(false); setArmed(false); setError(result.error); return; }
    router.push("/");
    router.refresh();
  };
  const theirs = other.theirs === "all" ? (mine.value === "all" ? text.bothShare(other.name) : text.theyShare(other.name)) : text.theyKeep(other.name);

  return (
    <section className={styles.sharing} aria-labelledby="pair-sharing">
      <h2 id="pair-sharing" className={common.sectionTitle}>{text.sharing}</h2>
      <label className={styles.toggle}>
        <input type="checkbox" role="switch" checked={mine.value === "all"} disabled={busy} onChange={(event) => share(event.target.checked)} />
        <span className={styles.track} aria-hidden="true" />
        <span>{text.shareAll(other.name)}</span>
      </label>
      <p className={styles.note}>{text.shareHint(other.name)}{locale === "en" ? " " : ""}{theirs}</p>
      <button type="button" className={styles.unlink} data-armed={armed ? "true" : undefined} disabled={busy} onClick={unlink} onBlur={() => setArmed(false)}>
        {armed ? text.unlinkConfirm : text.unlink(other.name)}
      </button>
      <p className={styles.note}>{text.unlinkHint}</p>
      {error ? <p className={styles.error}>{errorText(account, error)}</p> : null}
    </section>
  );
}
