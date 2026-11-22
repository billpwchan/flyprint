import type { Metadata } from "next";
import PlacesView from "../components/places/PlacesView";
import { pageTitle } from "../lib/request";
import { parseYear } from "../lib/scope";

type Props = { searchParams: Promise<{ year?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const year = parseYear((await searchParams).year);
  return { title: await pageTitle((text) => year ? `${text.nav.places} · ${year}` : text.nav.places) };
}

export default async function PlacesPage({ searchParams }: Props) {
  return <PlacesView year={parseYear((await searchParams).year)} />;
}
