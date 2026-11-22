"use client";

import type { Flight } from "../../lib/data";
import type { Insights } from "../../lib/insights";
import { destinationsOf, type YearReport } from "../../lib/years";
import { cityOf, metroOf } from "../../lib/places";
import { carrierName, type Locale } from "../../lib/i18n";
import { formatDuration, formatMonth, formatNumber, ui } from "../../lib/copy";
import Columns from "../common/Columns";
import CarrierMark from "../CarrierMark";
import AircraftProfile from "../aircraft/AircraftProfile";
import { typeName, typesIn } from "../../lib/fleet";
import { fleetUi } from "../../lib/copy-fleet";
import type { Reading } from "../common/Readings";
import styles from "./readings.module.css";

const MAX_PLACES = 6;

// The findings worth a sentence, for the whole archive or one year; each
// lights its flights on the globe.
export function archiveReadings(insights: Insights, list: Flight[], locale: Locale, currentYear: number): Reading[] {
  const byId = new Map(list.map((flight) => [flight.id, flight]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean) as Flight[];
  const text = ui[locale].readings;
  const n = (value: number) => formatNumber(value, locale);
  const city = (code: string) => cityOf(code, locale);
  const readings: Reading[] = [];

  if (insights.latest) {
    const { year, count, previous, peak } = insights.latest;
    const isPeak = peak.year === year;
    const title = year === currentYear ? text.paceCurrent(year, n(count)) : text.pacePast(year, n(count));
    const detail = isPeak && year !== currentYear
      ? text.pacePeak
      : previous ? text.paceDetail(previous.year, n(previous.count), peak.year, n(peak.count), previous.year === peak.year) : "";
    readings.push({ key: "pace", title, detail, flights: list.filter((flight) => flight.year === year), frame: false });
  }

  const [top, ...rest] = insights.topPairs;
  if (top && top.count > 1) {
    const others = rest.filter((pair) => pair.count > 1).map((pair) => text.pairJoin(city(pair.a), city(pair.b), n(pair.count)));
    readings.push({ key: "pair", title: text.pair(city(top.a), city(top.b), n(top.count)), detail: others.length ? text.pairDetail(text.list(others)) : "", flights: pick(top.ids) });
  }

  if (insights.firsts) {
    const { year, airports, ids } = insights.firsts;
    readings.push({ key: "firsts", title: text.firsts(year, n(airports.length)), detail: text.list(airports.map(city)), flights: pick(ids) });
  }

  if (insights.longest) {
    const flight = insights.longest;
    readings.push({
      key: "longest",
      title: text.longest(n(flight.km)),
      detail: text.longestDetail(`${city(flight.origin)}—${city(flight.destination)}`, formatMonth(flight.date, locale), formatDuration(flight.durationMinutes, locale)),
      flights: [flight],
    });
  }
  const type = typeReading(list, locale);
  if (type) readings.push(type);
  return readings;
}

// The type flown most, drawn; the runners-up named beneath.
function typeReading(list: Flight[], locale: Locale): Reading | null {
  const [top, ...rest] = typesIn(list);
  if (!top || top.flights.length < 2) return null;
  const others = rest.slice(0, 3).map((entry) => entry.type?.name ?? entry.model);
  return {
    key: "type",
    title: fleetUi[locale].mostType(typeName(top, locale), formatNumber(top.flights.length, locale)),
    detail: others.length ? fleetUi[locale].typeRest(others) : "",
    flights: top.flights,
    frame: false,
    chart: top.type ? <span className={styles.drawing}><AircraftProfile icao={top.icao} /></span> : undefined,
  };
}

// The year's airlines by their marks, most flown first.
function CarrierMarks({ airlines, locale }: { airlines: { name: string; count: number }[]; locale: Locale }) {
  return (
    <span className={styles.marks}>
      {airlines.map((entry) => (
        <span key={entry.name} title={carrierName(entry.name, locale)}>
          <CarrierMark airline={entry.name} size={26} />
          <small>{formatNumber(entry.count, locale)}</small>
        </span>
      ))}
    </span>
  );
}

export function yearReadings(report: YearReport, locale: Locale, firstYear: boolean): Reading[] {
  const text = ui[locale];
  const n = (value: number) => formatNumber(value, locale);
  const city = (code: string) => cityOf(code, locale);
  const places = (codes: string[]) => {
    const names = [...new Set(codes.map(city))];
    return names.length > MAX_PLACES ? text.readings.listMore(names.slice(0, MAX_PLACES)) : text.readings.list(names);
  };
  const readings: Reading[] = [];

  if (report.busiest) {
    const { month, flights: monthFlights } = report.busiest;
    const went = destinationsOf(report.trips.filter((trip) => Number(trip.start.slice(5, 7)) === month));
    readings.push({
      key: "month",
      title: text.years.busiest(text.years.month(month), n(monthFlights.length)),
      detail: went.length ? text.years.went(places(went)) : "",
      flights: monthFlights,
      chart: <Columns axis="all" columns={report.months.map((entry) => ({ key: entry.month, value: entry.flights.length, current: entry.month === month, label: locale === "en" ? text.years.month(entry.month).slice(0, 1) : String(entry.month) }))} />,
    });
  }

  if (!firstYear && report.newCities.length) {
    const codes = report.newCities.map((entry) => entry.code);
    const metros = new Set(report.newCities.map((entry) => entry.metro));
    readings.push({
      key: "new",
      title: text.years.newCities(n(report.newCities.length)),
      detail: places(codes),
      flights: report.flights.filter((flight) => metros.has(metroOf(flight.origin)) || metros.has(metroOf(flight.destination))),
    });
  }

  if (report.topPair) {
    const { a, b, count, ids } = report.topPair;
    readings.push({ key: "pair", title: text.readings.pair(city(a), city(b), n(count)), detail: "", flights: report.flights.filter((flight) => ids.includes(flight.id)) });
  }

  if (report.longest && report.flights.length > 1) {
    const flight = report.longest;
    readings.push({
      key: "longest",
      title: text.readings.longest(n(flight.km)),
      detail: text.readings.longestDetail(`${city(flight.origin)}—${city(flight.destination)}`, formatMonth(flight.date, locale), formatDuration(flight.durationMinutes, locale)),
      flights: [flight],
    });
  }

  // The runners-up show as their marks, not a list of names.
  const [airline] = report.airlines;
  if (airline && airline.count > 1) {
    readings.push({
      key: "airline",
      title: text.years.airline(carrierName(airline.name, locale), n(airline.count)),
      detail: "",
      flights: airline.flights,
      frame: false,
      chart: report.airlines.length > 1 ? <CarrierMarks airlines={report.airlines.slice(0, 7)} locale={locale} /> : undefined,
    });
  }
  const type = typeReading(report.flights, locale);
  if (type) readings.push(type);
  return readings.slice(0, 6);
}
