import type { Metadata } from "next";
import TripView from "../../components/trip/TripView";
import { pageTitle } from "../../lib/request";
import { tripTitle } from "../../lib/titles";
import { findTrip } from "../../lib/trips";
import { loadSession } from "../../lib/server/archive";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { archive } = await loadSession();
  const trip = findTrip(archive.flights, decodeURIComponent((await params).id));
  return { title: await pageTitle((text, locale) => trip ? tripTitle(trip, locale) : text.meta.trip) };
}

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TripView id={decodeURIComponent(id)} />;
}
