"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { Flight, Link as Linked } from "../../lib/data";
import { ui } from "../../lib/copy";
import { carrierName, type Locale } from "../../lib/i18n";
import { typesIn } from "../../lib/fleet";
import { airportOfMetro, cityOf } from "../../lib/places";
import { tripTitle } from "../../lib/titles";
import { findTrip } from "../../lib/trips";
import { useLocale } from "../LocaleProvider";
import { useArchive } from "../ArchiveProvider";
import { usePreviousPath } from "../shell/navigation";
import styles from "./common.module.css";

// The screen a path shows, named the way its own heading names it.
function labelFor(path: string, locale: Locale, flights: Flight[], links: Linked[]) {
  const text = ui[locale];
  const [pathname] = path.split("?");
  const [, section, id] = pathname.split("/").map(decodeURIComponent);
  const year = new URLSearchParams(path.split("?")[1] ?? "").get("year");
  const within = (name: string) => year ? `${name} · ${year}` : name;
  if (!section) return within(text.nav.trips);
  if (section === "places") return id ? cityOf(airportOfMetro(id), locale) : within(text.nav.places);
  if (section === "log") return within(text.nav.log);
  if (section === "trips") { if (!id) return within(text.nav.trips); const trip = findTrip(flights, id); return trip ? tripTitle(trip, locale) : text.meta.trip; }
  if (section === "with") { const link = links.find((entry) => entry.id === id); return link ? text.pair.title(link.name) : text.nav.trips; }
  if (section === "flights") return flights.find((flight) => flight.id === id)?.flight ?? text.meta.flight;
  if (section === "fleet" && id) { const entry = typesIn(flights).find((type) => type.icao === id); return entry ? entry.type?.name ?? entry.model : id; }
  if (section === "airlines" && id) return carrierName(id, locale);
  return text.nav.trips;
}

// Like a navigation bar's back button: it returns to the screen the reader
// came from and names it; opened cold, it goes to the section's index.
export default function BackLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  const { locale } = useLocale();
  const previous = usePreviousPath();
  const { all: flights, links } = useArchive();
  return (
    <Link
      href={previous ?? href}
      className={styles.back}
      onClick={(event) => {
        if (!previous || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        router.back();
      }}
    >
      <ChevronLeft aria-hidden="true" />
      <span>{previous ? labelFor(previous, locale, flights, links) : label}</span>
    </Link>
  );
}
