import type { Metadata } from "next";
import LogView from "../components/log/LogView";
import { pageTitle } from "../lib/request";
import { parseYear } from "../lib/scope";

type Props = { searchParams: Promise<{ year?: string; q?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const year = parseYear((await searchParams).year);
  return { title: await pageTitle((text) => year ? `${text.nav.log} · ${year}` : text.nav.log) };
}

export default async function LogPage({ searchParams }: Props) {
  const params = await searchParams;
  return <LogView year={parseYear(params.year)} query={typeof params.q === "string" ? params.q : ""} />;
}
