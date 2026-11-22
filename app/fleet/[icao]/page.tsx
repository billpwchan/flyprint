import type { Metadata } from "next";
import TypeView from "../../components/fleet/TypeView";
import { aircraftType } from "../../lib/aircraft/catalog";
import { pageTitle } from "../../lib/request";

type Props = { params: Promise<{ icao: string }> };
const codeOf = async (params: Props["params"]) => decodeURIComponent((await params).icao).toUpperCase();

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const icao = await codeOf(params);
  return { title: await pageTitle((text) => aircraftType(icao)?.name ?? text.nav.fleet) };
}

export default async function TypePage({ params }: Props) {
  const icao = await codeOf(params);
  return <TypeView key={icao} icao={icao} />;
}
