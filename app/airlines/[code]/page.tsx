import type { Metadata } from "next";
import AirlineView from "../../components/fleet/AirlineView";
import { loadSession } from "../../lib/server/archive";
import { carrierName } from "../../lib/i18n";
import { pageTitle } from "../../lib/request";

type Props = { params: Promise<{ code: string }> };
const codeOf = async (params: Props["params"]) => decodeURIComponent((await params).code).toUpperCase();

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = await codeOf(params);
  const { archive } = await loadSession();
  const known = archive.flights.some((flight) => flight.airline === code);
  return { title: await pageTitle((text, locale) => known ? carrierName(code, locale) : text.nav.fleet) };
}

export default async function AirlinePage({ params }: Props) {
  const code = await codeOf(params);
  return <AirlineView key={code} code={code} />;
}
