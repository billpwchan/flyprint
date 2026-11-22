"use client";

import { useMemo } from "react";
import { pathPoints } from "../../lib/network";
import { typesIn, makerName, routesIn } from "../../lib/fleet";
import { formatDate, formatNumber, ui } from "../../lib/copy";
import { fleetUi } from "../../lib/copy-fleet";
import { useLocale } from "../LocaleProvider";
import { useArchive } from "../ArchiveProvider";
import { useScene, useStage, type Scene } from "../stage/StageContext";
import DetailHead from "../common/Pager";
import { Figures, useTitle } from "../common/Lens";
import AircraftProfile from "../aircraft/AircraftProfile";
import common from "../common/common.module.css";
import styles from "./Fleet.module.css";
import { AllFlights, CarrierList, RouteBars, TailGrid } from "./parts";

// One aircraft type: drawn, measured, and everything flown on it.
export default function TypeView({ icao }: { icao: string }) {
  const { locale } = useLocale();
  const text = fleetUi[locale];
  const nav = ui[locale].nav;
  const { setPreview } = useStage();
  const { flights } = useArchive();
  const types = useMemo(() => typesIn(flights), [flights]);
  const index = types.findIndex((entry) => entry.icao === icao);
  const entry = index >= 0 ? types[index] : null;
  const name = entry ? entry.type?.name ?? entry.model : null;
  useTitle(name ?? nav.fleet);

  const scene = useMemo<Scene>(() => {
    const top = entry ? routesIn(entry.flights).slice(0, 4) : [];
    return {
      flights,
      focus: entry?.flights ?? null,
      pinned: top.flatMap((route) => [route.a, route.b]),
      camera: entry ? { kind: "fit", points: pathPoints(entry.flights), maxZoom: 5 } : { kind: "world" },
      cameraKey: `type:${icao}`,
    };
  }, [flights, entry, icao]);
  useScene(scene);

  const neighbour = (offset: number) => {
    const other = types[index + offset];
    return other ? { href: `/fleet/${encodeURIComponent(other.icao)}`, label: nav.fleet, title: other.type?.name ?? other.model } : null;
  };
  if (!entry) {
    return (
      <div className={common.detail}>
        <DetailHead backHref="/places" backLabel={nav.places} previous={null} next={null} />
        <h1 className={common.empty}>{text.typeNotFound}</h1>
      </div>
    );
  }

  const n = (value: number, digits = 0) => formatNumber(value, locale, digits);
  const type = entry.type;
  const count = entry.flights.length;
  const typical = entry.flights.filter((flight) => flight.aircraft?.source === "typical").length;
  return (
    <div className={common.detail}>
      <DetailHead backHref="/places" backLabel={nav.places} previous={neighbour(-1)} next={neighbour(1)} />
      <section aria-labelledby="type-title">
        {type ? (
          <div className={styles.hero}>
            <AircraftProfile icao={type.icao} length={text.metres(n(type.variant.length, 1))} label={`${makerName(type.maker, locale)} ${type.name}`} />
          </div>
        ) : null}
        {type ? <p className={styles.maker}>{makerName(type.maker, locale)}</p> : null}
        <h1 id="type-title" className={common.headline}>{name}</h1>
        <p className={common.lead}>
          {count > 1 ? text.lead(formatDate(entry.first, locale), formatDate(entry.last, locale), n(count)) : text.once(formatDate(entry.first, locale))}
          {typical ? text.typical(n(typical), n(count)) : ""}
        </p>
        {type ? (
          <Figures items={[
            { value: text.metres(n(type.span, 1)), label: text.span },
            { value: text.metres(n(type.height, 1)), label: text.height },
            { value: text.year(type.firstFlight.slice(0, 4)), label: text.firstFlight },
          ]} />
        ) : null}
      </section>
      <TailGrid flights={entry.flights} locale={locale} onPreview={setPreview} />
      <CarrierList flights={entry.flights} locale={locale} onPreview={setPreview} title={text.carriers} />
      <RouteBars flights={entry.flights} scope={`type:${entry.icao}`} locale={locale} onPreview={setPreview} />
      <AllFlights query={`type:${entry.icao}`} count={count} locale={locale} />
    </div>
  );
}
