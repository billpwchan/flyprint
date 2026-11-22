import type { Metadata } from "next";
import FlightView from "../../components/flight/FlightView";
import { loadSession } from "../../lib/server/archive";
import { cityOf } from "../../lib/places";
import { pageTitle } from "../../lib/request";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = decodeURIComponent((await params).id);
  const { archive } = await loadSession();
  const flight = archive.flights.find((item) => item.id === id);
  return { title: await pageTitle((text, locale) => flight ? `${flight.flight} ${cityOf(flight.origin, locale)} → ${cityOf(flight.destination, locale)}` : text.meta.flight) };
}

export default async function FlightPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  return <FlightView key={id} id={id} />;
}
