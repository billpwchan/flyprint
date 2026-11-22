"use client";

import Link from "next/link";
import { useMemo } from "react";
import { publicUi } from "../../lib/copy-public";
import { useLocale } from "../LocaleProvider";
import { useArchive } from "../ArchiveProvider";
import { useScene, type Scene } from "../stage/StageContext";
import { useTitle } from "./Lens";
import common from "./common.module.css";

// An address that leads nowhere, or a public page that is no longer shared.
export default function Lost({ title, lead }: { title?: string; lead?: string }) {
  const { locale } = useLocale();
  const words = publicUi[locale].lost;
  const { flights } = useArchive();
  useTitle(title ?? words.title);
  useScene(useMemo<Scene>(() => ({ flights, focus: [], camera: { kind: "world" }, cameraKey: "lost" }), [flights]));
  return (
    <div className={common.detail} style={{ paddingTop: 34 }}>
      <h1 className={common.headline}>{title ?? words.title}</h1>
      <p className={common.lead}>{lead ?? words.lead}</p>
      <Link href="/" className={common.emptyAction}>{words.home}</Link>
    </div>
  );
}
