"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Flight } from "../../lib/data";
import { carrierName } from "../../lib/i18n";
import { cityOf, coordinatesOf } from "../../lib/places";
import { skyAlong, type Sky } from "../../lib/daylight";
import { pathPoints } from "../../lib/network";
import { tripOf } from "../../lib/trips";
import { describeSky, formatDay, formatDayRange, formatLegDate, formatNumber, ui } from "../../lib/copy";
import { tripTitle } from "../../lib/titles";
import { toneColor } from "../../lib/palette";
import CarrierMark from "../CarrierMark";
import AircraftProfile from "../aircraft/AircraftProfile";
import AirframePhoto from "../aircraft/AirframePhoto";
import { aircraftType } from "../../lib/aircraft/catalog";
import { fleetUi } from "../../lib/copy-fleet";
import { localModel } from "../../lib/fleet";
import type { Locale } from "../../lib/i18n";
import { useLocale } from "../LocaleProvider";
import { useArchive, useClock, useLinks, useViewer } from "../ArchiveProvider";
import { countdownOf, hasLanded, seatSide } from "../../lib/plan";
import { countdownText, planUi } from "../../lib/copy-plan";
import { accountUi, errorText } from "../../lib/copy-account";
import { call } from "../account/api";
import FlightForm from "./FlightForm";
import { useScene, type Scene } from "../stage/StageContext";
import { LegBoard } from "../common/LegBoard";
import { FlightWeather } from "../common/Weather";
import Owner from "../common/Owner";
import DetailHead from "../common/Pager";
import ShareCard from "../cards/ShareCard";
import CityImage from "../common/CityImage";
import { useTitle } from "../common/Lens";
import common from "../common/common.module.css";
import styles from "./FlightView.module.css";

const oldestFirst = (a: Flight, b: Flight) => a.date.localeCompare(b.date) || a.depart.localeCompare(b.depart) || a.id.localeCompare(b.id);

export default function FlightView({ id }: { id: string }) {
  const { locale } = useLocale();
  const text = ui[locale];
  const { flights, all, owner } = useArchive();
  const links = useLinks();
  const clock = useClock();
  const flight = useMemo(() => all.find((item) => item.id === id) ?? null, [all, id]);
  // Browsing runs through every flight, booked ones included; counts are of flights flown.
  const context = useMemo(() => all.slice().sort(oldestFirst), [all]);
  const flown = useMemo(() => flights.slice().sort(oldestFirst), [flights]);
  const trip = useMemo(() => flight ? tripOf(all, flight.id) : null, [all, flight]);
  const sky = useMemo(() => flight?.departAt && flight.durationMinutes > 0
    ? skyAlong(coordinatesOf(flight.origin), coordinatesOf(flight.destination), flight.departAt, flight.durationMinutes)
    : null, [flight]);

  const scene = useMemo<Scene>(() => ({
    flights,
    focus: flight ? [flight] : null,
    directed: true,
    pinned: flight ? [flight.destination, flight.origin] : [],
    camera: flight ? { kind: "fit", points: pathPoints([flight]), maxZoom: 6 } : { kind: "world" },
    sunAt: flight?.departAt ?? undefined,
    cameraKey: `flight:${id}`,
  }), [flights, flight, id]);
  useScene(scene);
  useTitle(flight ? flight.flight : text.meta.flight);

  if (!flight) {
    return (
      <div className={common.detail}>
        <DetailHead backHref="/log" backLabel={text.nav.log} previous={null} next={null} />
        <h1 className={common.empty}>{text.flight.notFound}</h1>
      </div>
    );
  }

  const n = (value: number) => formatNumber(value, locale);
  const index = context.findIndex((item) => item.id === flight.id);
  const landed = hasLanded(flight, clock.now);
  const countdown = countdownOf(flight, clock);
  const skyLine = sky ? describeSky(sky, locale) : null;
  const seatLine = sky && !landed ? seatAdvice(sky, flight, locale) : null;
  const sameRoute = flown.filter((item) => item.origin === flight.origin && item.destination === flight.destination);
  const reverse = flown.filter((item) => item.origin === flight.destination && item.destination === flight.origin);
  const order = landed ? flown.findIndex((item) => item.id === flight.id) + 1 : flown.length + context.slice(0, index + 1).filter((item) => !hasLanded(item, clock.now)).length;
  const flownAirline = !!flight.airline && flights.some((item) => item.airline === flight.airline);
  const companions = (flight.with ?? []).map((linkId) => links.get(linkId)).filter((link) => !!link);
  const neighbour = (offset: number) => {
    const other = context[index + offset];
    return other ? { href: `/flights/${encodeURIComponent(other.id)}`, label: offset < 0 ? text.flight.previous : text.flight.next, title: `${other.flight} · ${cityOf(other.origin, locale)} → ${cityOf(other.destination, locale)} · ${formatDayRange(other.date, other.date, locale)}` } : null;
  };

  return (
    <div className={common.detail}>
      <DetailHead backHref="/log" backLabel={text.nav.log} previous={neighbour(-1)} next={neighbour(1)} actions={<ShareCard quiet request={{ kind: "flight", flight, ordinal: landed ? order : null }} />} />
      <header className={styles.header}>
        <div className={styles.identity}>
          <CarrierMark airline={flight.airline} size={34} />
          <div>
            <h1>{flight.flight}</h1>
            <p>{flownAirline ? <Link href={`/airlines/${encodeURIComponent(flight.airline)}`} className={styles.carrierLink}>{carrierName(flight.airline, locale)}</Link> : carrierName(flight.airline, locale)}</p>
          </div>
        </div>
        <p className={styles.when}>
          <span>{formatLegDate(flight.date, locale)}</span>
          {landed ? <span>{text.flight.ordinal(n(order))}</span> : <span style={{ color: toneColor(owner.tone) }}>{countdownText(countdown, flight.depart, locale)}</span>}
        </p>
      </header>

      <div className={styles.board}>
        <LegBoard flight={flight} locale={locale} large sky={sky} progress={countdown.kind === "airborne" ? countdown.progress : undefined} />
        <FlightWeather flight={flight} locale={locale} />
        {skyLine ? <p className={styles.sky}>{skyLine}{seatLine ? <><br />{seatLine}</> : null}</p> : null}
      </div>

      {flight.aircraft ? <AircraftSection flight={flight} flown={flown} landed={landed} /> : null}

      <dl className={styles.facts}>
        {flight.aircraft ? null : (
          <div>
            <dt>{text.flight.aircraft}</dt>
            <dd>
              <p className={styles.muted}>{landed ? text.trip.aircraftUnknown : planUi[locale].typeLater}</p>
              {flight.operation ? <p>{text.flight.operatedBy(carrierName(flight.operation.airline, locale), flight.operation.flight)}</p> : null}
            </dd>
          </div>
        )}
        <div>
          <dt>{text.flight.route}</dt>
          <dd>
            <Link href={`/log?q=${encodeURIComponent(`${flight.origin} ${flight.destination}`)}`} className={styles.primaryLink}>{cityOf(flight.origin, locale)} → {cityOf(flight.destination, locale)}</Link>
            <p>{landed ? text.flight.routeLine(n(sameRoute.findIndex((item) => item.id === flight.id) + 1), n(sameRoute.length), n(reverse.length)) : planUi[locale].route(n(sameRoute.length))}</p>
          </dd>
        </div>
        {trip ? (
          <div>
            <dt>{text.flight.trip}</dt>
            <dd>
              <Link href={`/trips/${encodeURIComponent(trip.id)}`} className={styles.tripLink}>
                <CityImage code={trip.destination} className={styles.tripImage} />
                <span>
                  <b>{tripTitle(trip, locale)}</b>
                  <small>{formatDayRange(trip.start, trip.end, locale)}{trip.flights.length > 1 ? ` · ${text.flight.tripLeg(n(trip.flights.findIndex((leg) => leg.id === flight.id) + 1), n(trip.flights.length))}` : ""}</small>
                </span>
              </Link>
            </dd>
          </div>
        ) : null}
        {flight.seat || flight.cabin ? (
          <div>
            <dt>{accountUi[locale].flight.seat}</dt>
            <dd>
              <p className={styles.primary}>{[flight.cabin ? accountUi[locale].flight.cabins[flight.cabin] ?? flight.cabin : null, flight.seat].filter(Boolean).join(" · ")}</p>
            </dd>
          </div>
        ) : null}
        {companions.length ? (
          <div>
            <dt>{text.flight.with}</dt>
            <dd className={styles.people}>
              {companions.map((link) => <Owner key={link.id} color={toneColor(link.tone)} label={link.name} href={`/with/${encodeURIComponent(link.id)}`} />)}
            </dd>
          </div>
        ) : null}
      </dl>

      <p className={styles.provenance}>{countdown.kind === "airborne" ? `${text.flight.time[flight.timeSource]} · ${planUi[locale].estimated}` : text.flight.time[flight.timeSource]}</p>
      <FlightActions flight={flight} />
    </div>
  );
}

// The window to sit by for the sunrise or sunset on a flight still ahead, or
// what the seat already booked will see.
function seatAdvice(sky: Sky, flight: Flight, locale: Locale) {
  const [event] = sky.events;
  if (!event) return null;
  const text = planUi[locale];
  const body = flight.aircraft?.body;
  const yours = seatSide(flight.seat, body);
  if (yours) return text.seatYours(flight.seat!, text.side[yours.side], text.event[event.kind], yours.side === event.side);
  const letter = event.side === "left" ? "A" : body === "widebody" ? "K" : body === "narrowbody" ? "F" : null;
  return letter ? text.seatPick(letter) : null;
}

// The aircraft as itself: the type drawn to scale, then the airframe that flew.
// Counts are of flights flown; a booked flight is measured against them.
function AircraftSection({ flight, flown, landed }: { flight: Flight; flown: Flight[]; landed: boolean }) {
  const { locale } = useLocale();
  const text = ui[locale];
  const fleet = fleetUi[locale];
  const aircraft = flight.aircraft!;
  const n = (value: number) => formatNumber(value, locale);
  const icao = aircraft.icao.toUpperCase();
  const type = aircraftType(icao);
  const registration = aircraft.registration;
  const sameTail = registration ? flown.filter((item) => item.aircraft?.registration === registration && item.id !== flight.id) : [];
  const onType = flown.filter((item) => item.aircraft?.icao?.toUpperCase() === icao).length;
  const before = landed ? flown.slice(0, flown.findIndex((item) => item.id === flight.id)) : flown;
  const firstOfType = (aircraft.source === "operated" || !landed) && !before.some((item) => item.aircraft?.icao?.toUpperCase() === icao);
  const model = localModel(aircraft.model, locale);
  // A type only booked so far has no page of its own yet.
  const typeHref = onType ? `/fleet/${encodeURIComponent(icao)}` : null;
  return (
    <section className={styles.aircraft} aria-labelledby="aircraft-title">
      <h2 id="aircraft-title" className={common.sectionTitle}>{text.flight.aircraft}</h2>
      {type ? (
        typeHref ? (
          <Link href={typeHref} className={styles.drawing} aria-label={model}>
            <AircraftProfile icao={icao} length={fleet.metres(formatNumber(type.variant.length, locale, 1))} tentative={aircraft.source === "typical"} />
          </Link>
        ) : (
          <span className={styles.drawing}>
            <AircraftProfile icao={icao} length={fleet.metres(formatNumber(type.variant.length, locale, 1))} tentative={aircraft.source === "typical"} />
          </span>
        )
      ) : null}
      <div className={styles.typeLine}>
        {typeHref ? <Link href={typeHref} className={styles.primaryLink}>{model}</Link> : <p className={styles.primary}>{model}</p>}
        <p>{[text.flight.basis[aircraft.source], firstOfType ? text.flight.firstType : fleet.onType(n(onType))].join(" · ")}</p>
        {flight.operation ? <p>{text.flight.operatedBy(carrierName(flight.operation.airline, locale), flight.operation.flight)}</p> : null}
      </div>
      {registration ? (
        <div className={styles.tail}>
          <AirframePhoto registration={registration} credit={fleet.credit} />
          <div className={styles.tailText}>
            <strong>{registration}</strong>
            {sameTail.length ? <p>{text.flight.sameTail(n(sameTail.length + 1))}</p> : null}
            {sameTail.length ? (
              <p className={styles.dates}>
                {sameTail.slice(-4).map((item) => <Link key={item.id} href={`/flights/${encodeURIComponent(item.id)}`} className={styles.inline}>{formatDay(item.date, locale)}</Link>)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// Every flight on these pages is the reader's own, so any can be put right or deleted.
function FlightActions({ flight }: { flight: Flight }) {
  const viewer = useViewer();
  const { locale } = useLocale();
  const router = useRouter();
  const text = accountUi[locale];
  const [state, setState] = useState<"idle" | "confirm" | "busy">("idle");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!viewer) return null;
  if (editing) {
    return (
      <section className={styles.editing} aria-label={text.flight.editTitle}>
        <h2 className={styles.editTitle}>{text.flight.editTitle}</h2>
        <FlightForm key={flight.id} flight={flight} onCancel={() => setEditing(false)} onDone={() => { setEditing(false); router.refresh(); }} />
      </section>
    );
  }
  const run = async () => {
    if (state === "idle") { setState("confirm"); return; }
    if (state === "busy") return;
    setState("busy");
    const result = await call(`/api/flights/${encodeURIComponent(flight.id)}`, { method: "DELETE" });
    if (!result.ok) { setError(result.error); setState("idle"); return; }
    router.push("/log");
    router.refresh();
  };
  return (
    <p className={styles.remove}>
      <button type="button" onClick={() => { setError(null); setEditing(true); }} className={styles.editButton}>{text.flight.edit}</button>
      <button type="button" onClick={run} onBlur={() => { if (state === "confirm") setState("idle"); }} data-armed={state === "confirm" ? "true" : undefined} disabled={state === "busy"}>
        {state === "busy" ? text.flight.removing : state === "confirm" ? text.flight.confirm : text.flight.remove}
      </button>
      {error ? <span>{errorText(text, error)}</span> : null}
    </p>
  );
}

