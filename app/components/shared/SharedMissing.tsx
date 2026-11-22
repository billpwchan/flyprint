"use client";

import { publicUi } from "../../lib/copy-public";
import { useLocale } from "../LocaleProvider";
import Lost from "../common/Lost";

// A public page whose owner stopped sharing it, or a mistyped link.
export default function SharedMissing() {
  const { locale } = useLocale();
  const words = publicUi[locale].shared;
  return <Lost title={words.missing} lead={words.missingLead} />;
}
