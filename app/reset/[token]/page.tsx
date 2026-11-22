import type { Metadata } from "next";
import ResetView from "../../components/account/ResetView";
import { publicUi } from "../../lib/copy-public";
import { requestLocale, titled } from "../../lib/request";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return { title: await titled(publicUi[await requestLocale()].reset.newTitle), robots: { index: false }, referrer: "no-referrer" };
}

// The token is checked when the new password is saved, so a used or expired
// link says so then, with the way to ask for another.
export default async function ChoosePasswordPage({ params }: Props) {
  return <ResetView token={(await params).token} />;
}
