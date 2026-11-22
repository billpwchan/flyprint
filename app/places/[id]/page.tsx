import type { Metadata } from "next";
import PlaceView from "../../components/places/PlaceView";
import { airportOfMetro, cityOf, metroOf } from "../../lib/places";
import { pageTitle } from "../../lib/request";
import { loadSession } from "../../lib/server/archive";
import { runwaysOfMetro } from "../../lib/server/runways";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const metro = metroOf(decodeURIComponent((await params).id).toUpperCase());
  await loadSession();
  return { title: await pageTitle((_, locale) => cityOf(airportOfMetro(metro), locale)) };
}

export default async function PlacePage({ params }: { params: Promise<{ id: string }> }) {
  const metro = metroOf(decodeURIComponent((await params).id).toUpperCase());
  return <PlaceView key={metro} metro={metro} runways={runwaysOfMetro(metro)} />;
}
