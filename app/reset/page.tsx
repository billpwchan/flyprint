import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import ResetView from "../components/account/ResetView";
import { publicUi } from "../lib/copy-public";
import { requestLocale, titled } from "../lib/request";
import { loadSession } from "../lib/server/archive";
import { mailConfigured } from "../lib/server/mail";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await titled(publicUi[await requestLocale()].reset.title), robots: { index: false } };
}

export default async function ResetPage() {
  if (!mailConfigured()) notFound();
  // A trial may have an account it forgot the password to.
  const { user } = await loadSession();
  if (user && !user.guest) redirect("/settings");
  return <ResetView token={null} />;
}
