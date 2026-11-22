import { cityOf } from "./places";
import { ui } from "./copy";
import type { Locale } from "./i18n";
import type { Trip } from "./trips";

// A trip is named after where it went, as the app names it; the other stops
// are said under it. A move is named by the new home; a flight home with no
// flight out before it, by its two ends.
export function tripTitle(trip: Trip, locale: Locale) {
  if (trip.kind === "return") return ui[locale].trips.oneWay(cityOf(trip.origin, locale), cityOf(trip.flights.at(-1)!.destination, locale));
  if (trip.kind === "move") {
    const city = cityOf(trip.homeAfter, locale);
    return locale === "en" ? `Moved to ${city}` : `${ui[locale].units.moved}${city}`;
  }
  return cityOf(trip.destination, locale);
}

// The other places a trip stayed, after the one it is named for: "经纽约、旧金山".
export function tripVia(trip: Trip, locale: Locale) {
  if (trip.kind !== "round") return "";
  const stays = trip.stays.filter((code) => code !== trip.destination).map((code) => cityOf(code, locale));
  if (!stays.length) return "";
  return locale === "en" ? `via ${stays.join(", ")}` : `${locale === "zh-Hant" ? "經" : "经"}${stays.join("、")}`;
}
