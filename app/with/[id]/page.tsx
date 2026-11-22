import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PairView from "../../components/pair/PairView";
import { pageTitle } from "../../lib/request";
import { parseYear } from "../../lib/scope";
import { DEMO_LINK, loadPair, loadSession } from "../../lib/server/archive";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const pair = await loadPair(decodeURIComponent((await params).id));
  return { title: await pageTitle((text) => pair ? text.pair.title(pair.other.name) : text.pair.notFound) };
}

export default async function WithPage({ params, searchParams }: Props) {
  const id = decodeURIComponent((await params).id);
  if (id !== DEMO_LINK && !(await loadSession()).user) redirect(`/login?next=${encodeURIComponent(`/with/${id}`)}`);
  return <PairView id={id} pair={await loadPair(id)} year={parseYear((await searchParams).year)} />;
}
