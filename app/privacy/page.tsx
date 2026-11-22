import type { Metadata } from "next";
import LegalView from "../components/common/LegalView";
import { legalUi } from "../lib/copy-legal";
import { requestLocale, titled } from "../lib/request";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await titled(legalUi[await requestLocale()].privacy.title) };
}

// FLYPRINT_CONTACT: the address readers write to; left out of the page when unset.
export default function Page() {
  return <LegalView kind="privacy" contact={process.env.FLYPRINT_CONTACT?.trim() || null} />;
}
