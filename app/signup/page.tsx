import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthView from "../components/account/AuthView";
import { accountUi } from "../lib/copy-account";
import { requestLocale, titled } from "../lib/request";
import { loadSession } from "../lib/server/archive";
import { safeNext } from "../lib/next";
import { mailConfigured } from "../lib/server/mail";

type Props = { searchParams: Promise<{ next?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return { title: await titled(accountUi[await requestLocale()].auth.signUpTitle) };
}

export default async function SignupPage({ searchParams }: Props) {
  const next = safeNext((await searchParams).next);
  // A trial comes here to keep its flights.
  const { user } = await loadSession();
  if (user && !user.guest) redirect(next);
  return <AuthView mode="signup" next={next} canReset={mailConfigured()} />;
}
