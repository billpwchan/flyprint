import type { Metadata } from "next";
import TripsView from "./components/trips/TripsView";
import { pageTitle } from "./lib/request";
import { parseYear } from "./lib/scope";

type Props = { searchParams: Promise<{ year?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const year = parseYear((await searchParams).year);
  return { title: await pageTitle((text) => year ? text.meta.years(year) : null) };
}

export default async function TripsPage({ searchParams }: Props) {
  return <TripsView year={parseYear((await searchParams).year)} />;
}
