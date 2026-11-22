import type { Metadata } from "next";
import JoinView from "../../components/account/JoinView";
import { accountUi } from "../../lib/copy-account";
import { requestLocale, titled } from "../../lib/request";
import { loadSession } from "../../lib/server/archive";
import { inviterOf, linkBetween } from "../../lib/server/links";

type Props = { params: Promise<{ token: string }> };

// An invite link names only who sent it; its token never reaches the page's other links.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const inviter = inviterOf(decodeURIComponent((await params).token));
  const text = accountUi[await requestLocale()].join;
  return { title: await titled(inviter ? text.title(inviter.name) : text.gone), robots: { index: false } };
}

export default async function JoinPage({ params }: Props) {
  const token = decodeURIComponent((await params).token);
  const { user } = await loadSession();
  const inviter = inviterOf(token);
  const state = !inviter ? "gone" : user?.id === inviter.id ? "self" : user && linkBetween(user.id, inviter.id) ? "linked" : user && !user.guest ? "ready" : "signed-out";
  return <JoinView token={token} state={state} inviter={inviter} />;
}
