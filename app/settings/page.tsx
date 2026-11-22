import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SettingsView from "../components/account/SettingsView";
import { accountUi } from "../lib/copy-account";
import { requestLocale, titled } from "../lib/request";
import { loadSession } from "../lib/server/archive";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await titled(accountUi[await requestLocale()].settings.title) };
}

export default async function SettingsPage() {
  const { user } = await loadSession();
  if (!user) redirect("/login?next=/settings");
  // A trial has nothing to set until it is kept.
  if (user.guest) redirect("/signup");
  return <SettingsView />;
}
