import type { Metadata } from "next";
import ImportView from "../components/account/ImportView";
import { accountUi } from "../lib/copy-account";
import { requestLocale, titled } from "../lib/request";

type Props = { searchParams: Promise<{ id?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return { title: await titled(accountUi[await requestLocale()].import.title) };
}

// Open to visitors: their first upload starts a trial account.
export default async function ImportPage({ searchParams }: Props) {
  const id = (await searchParams).id;
  return <ImportView initialId={id && /^[a-z0-9_]{4,40}$/i.test(id) ? id : null} />;
}
