"use client";

import { useMemo } from "react";
import { countdownOf, isAirborne } from "../../lib/plan";
import { countdownText, planUi } from "../../lib/copy-plan";
import { yearCounts } from "../../lib/insights";
import { buildTrips, type Trip } from "../../lib/trips";
import { formatNumber, ui } from "../../lib/copy";
import { pathPoints } from "../../lib/network";
import { useLocale } from "../LocaleProvider";
import { useArchive, useClock, useViewer } from "../ArchiveProvider";
import { useScene, useStage, type Scene } from "../stage/StageContext";
import { useYearParam } from "../shell/address";
import { Lens, useTitle } from "../common/Lens";
import TripRow from "../common/TripRow";
import ScopeFigures from "../common/ScopeFigures";
import { ImageryCredit } from "../common/CityImage";
import NextFlight from "../plan/NextFlight";
import ShareCard from "../cards/ShareCard";
import common from "../common/common.module.css";

// The first of the three parts, as in the app: how many flights and how far
// (opening the footprint), the next flight, then every trip, the coming ones
// first, then by year, newest first. Hovering a trip draws it on the globe;
// while a flight is in the air, the globe follows it. A visitor sees the
// sample's flown trips only: someone deciding whether to try the site wants
// to see a life of flights, not a stranger's bookings counting down.
export default function TripsView({ year: serverYear }: { year: number | null }) {
  const { locale, currentYear } = useLocale();
  const text = ui[locale];
  const { setPreview } = useStage();
  const [year, setYear] = useYearParam("/", serverYear);
  const viewer = useViewer();
  const { flights: list, all: everything, ahead } = useArchive();
  const clock = useClock();
  const counts = useMemo(() => yearCounts(list), [list]);
  const yearFlights = useMemo(() => year ? list.filter((flight) => flight.year === year) : list, [list, year]);
  // Trips are read whole, booked legs included: one with a leg still ahead is
  // listed once, with what is coming (a trip under way leads), never also
  // half-finished among the past ones.
  const { past, coming } = useMemo(() => {
    const waiting = new Set(ahead.map((flight) => flight.id));
    const built = buildTrips(everything);
    const isComing = (trip: Trip) => trip.flights.some((flight) => waiting.has(flight.id));
    return { past: built.filter((trip) => !isComing(trip)), coming: built.filter(isComing).reverse() };
  }, [everything, ahead]);
  const shownComing = !viewer ? [] : year ? coming.filter((trip) => trip.year === year || trip.flights.some((flight) => flight.year === year)) : coming;
  const trips = useMemo(() => year ? past.filter((trip) => trip.year === year) : past, [past, year]);
  useTitle(year ? text.meta.years(year) : null);

  const flying = viewer ? ahead.find((flight) => isAirborne(flight, clock.now)) ?? null : null;
  const following = flying && (!year || year === currentYear) ? flying : null;
  const scene = useMemo<Scene>(() => {
    if (following) {
      return {
        flights: list,
        focus: [following],
        directed: true,
        pinned: [following.destination, following.origin],
        camera: { kind: "fit", points: pathPoints([following]), maxZoom: 5 },
        cameraKey: `trips:${year ?? "all"}:air:${following.id}`,
      };
    }
    const focus = year && yearFlights.length ? yearFlights : null;
    return {
      flights: list,
      focus,
      camera: { kind: "world", around: focus ?? undefined },
      cameraKey: `trips:${year ?? "all"}`,
    };
  }, [list, year, yearFlights, following]);
  useScene(scene);

  const grouped = useMemo(() => {
    const groups = new Map<number, Trip[]>();
    for (const trip of trips) groups.set(trip.year, [...(groups.get(trip.year) ?? []), trip]);
    return [...groups.entries()];
  }, [trips]);
  const totals = new Map(counts.map((entry) => [entry.year, entry]));
  const n = (value: number) => formatNumber(value, locale);
  // What comes next belongs with the whole archive and with the year it falls in.
  const showNext = !!viewer && ahead.length > 0 && (!year || year === currentYear || ahead[0].year === year);

  return (
    <Lens counts={counts} year={year} onYear={setYear} onPreviewYear={(value) => setPreview(value ? list.filter((flight) => flight.year === value) : null)}>
      <ScopeFigures
        flights={yearFlights}
        locale={locale}
        year={year}
        href={year ? `/places?year=${year}` : "/places"}
        action={<ShareCard request={{ kind: "year", year }} />}
      />
      {showNext ? <div className={common.section}><NextFlight locale={locale} /></div> : null}
      {!yearFlights.length ? (
        !list.length && shownComing.length ? (
          <>
            <h1 className={common.headline}>{planUi[locale].noneYet}</h1>
            <p className={common.lead}>{planUi[locale].noneYetLead}</p>
          </>
        ) : shownComing.length ? <h1 className="visually-hidden">{text.meta.years(year ?? 0)}</h1>
        : <h1 className={common.empty}>{year ? text.years.empty(year) : "—"}</h1>
      ) : null}
      {shownComing.length ? (
        <section className={common.group} aria-labelledby="trips-ahead">
          <header className={common.groupHead}>
            <h2 id="trips-ahead">{planUi[locale].ahead}</h2>
            <span>{planUi[locale].legs(n(shownComing.reduce((sum, trip) => sum + trip.flights.filter((flight) => ahead.includes(flight)).length, 0)))}</span>
          </header>
          <ol className={common.tripList}>
            {shownComing.map((trip) => {
              const next = trip.flights.find((flight) => ahead.includes(flight))!;
              const underway = next !== trip.flights[0];
              return <TripRow key={trip.id} trip={trip} locale={locale} onPreview={setPreview} when={underway ? planUi[locale].underway : countdownText(countdownOf(next, clock), next.depart, locale, true)} />;
            })}
          </ol>
        </section>
      ) : null}
      {grouped.map(([groupYear, yearTrips]) => {
        const total = totals.get(groupYear);
        return (
          <section key={groupYear} className={common.group} aria-labelledby={`trips-${groupYear}`}>
            <header className={common.groupHead}>
              <h2 id={`trips-${groupYear}`}>{groupYear}</h2>
              {total ? <span>{text.trips.yearLine(n(total.count), n(total.km))}</span> : null}
            </header>
            <ol className={common.tripList}>
              {yearTrips.map((trip) => <TripRow key={trip.id} trip={trip} locale={locale} onPreview={setPreview} />)}
            </ol>
          </section>
        );
      })}
      {trips.length || shownComing.length ? <ImageryCredit locale={locale} /> : null}
    </Lens>
  );
}
