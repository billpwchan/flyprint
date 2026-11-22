"use client";

import { useMemo } from "react";
import { pathPoints } from "../../lib/network";
import { carriersIn, routesIn, typesIn } from "../../lib/fleet";
import { carrierName } from "../../lib/i18n";
import { formatDate, formatNumber, ui } from "../../lib/copy";
import { fleetUi } from "../../lib/copy-fleet";
import { useLocale } from "../LocaleProvider";
import { useArchive } from "../ArchiveProvider";
import { useScene, useStage, type Scene } from "../stage/StageContext";
import DetailHead from "../common/Pager";
import { Figures, useTitle } from "../common/Lens";
import CarrierMark from "../CarrierMark";
import common from "../common/common.module.css";
import styles from "./Fleet.module.css";
import { AllFlights, RouteBars, TailGrid, TypeLineup } from "./parts";

// One airline: its mark, how far it carried the reader, on what, and where.
export default function AirlineView({ code }: { code: string }) {
  const { locale } = useLocale();
  const text = fleetUi[locale];
  const nav = ui[locale].nav;
  const { setPreview } = useStage();
  const { flights } = useArchive();
  const carriers = useMemo(() => carriersIn(flights), [flights]);
  const index = carriers.findIndex((entry) => entry.code === code);
  const entry = index >= 0 ? carriers[index] : null;
  const types = useMemo(() => entry ? typesIn(entry.flights) : [], [entry]);
  const routes = useMemo(() => entry ? routesIn(entry.flights) : [], [entry]);
  const name = carrierName(code, locale);
  useTitle(entry ? name : nav.fleet);

  const scene = useMemo<Scene>(() => ({
    flights,
    focus: entry?.flights ?? null,
    pinned: routes.slice(0, 4).flatMap((route) => [route.a, route.b]),
    camera: entry ? { kind: "fit", points: pathPoints(entry.flights), maxZoom: 5 } : { kind: "world" },
    cameraKey: `airline:${code}`,
  }), [flights, entry, routes, code]);
  useScene(scene);

  const neighbour = (offset: number) => {
    const other = carriers[index + offset];
    return other ? { href: `/airlines/${encodeURIComponent(other.code)}`, label: nav.fleet, title: carrierName(other.code, locale) } : null;
  };
  if (!entry) {
    return (
      <div className={common.detail}>
        <DetailHead backHref="/places" backLabel={nav.places} previous={null} next={null} />
        <h1 className={common.empty}>{text.carrierNotFound}</h1>
      </div>
    );
  }

  const n = (value: number) => formatNumber(value, locale);
  const count = entry.flights.length;
  return (
    <div className={common.detail}>
      <DetailHead backHref="/places" backLabel={nav.places} previous={neighbour(-1)} next={neighbour(1)} />
      <section aria-labelledby="airline-title">
        <div className={styles.identity}>
          <CarrierMark airline={code} size={52} />
          <h1 id="airline-title" className={common.headline}>{name}<span className={styles.code}>{code}</span></h1>
        </div>
        <p className={common.lead}>{count > 1 ? text.lead(formatDate(entry.first, locale), formatDate(entry.last, locale), n(count)) : text.once(formatDate(entry.first, locale))}</p>
        <Figures items={[
          { value: n(count), label: text.flights(n(count)) },
          { value: n(entry.km), label: text.km },
          { value: n(Math.round(entry.minutes / 60)), label: text.hours },
          { value: n(routes.length), label: text.routeCount(n(routes.length)) },
        ]} />
      </section>
      {types.length ? <TypeLineup types={types} locale={locale} onPreview={setPreview} /> : null}
      <TailGrid flights={entry.flights} locale={locale} onPreview={setPreview} />
      <RouteBars flights={entry.flights} scope={`airline:${code}`} locale={locale} onPreview={setPreview} />
      <AllFlights query={`airline:${code}`} count={count} locale={locale} />
    </div>
  );
}
