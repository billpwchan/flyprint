"use client";

import Link from "next/link";
import { useMemo } from "react";
import { legalUi } from "../../lib/copy-legal";
import { useLocale } from "../LocaleProvider";
import { useArchive } from "../ArchiveProvider";
import { useScene, type Scene } from "../stage/StageContext";
import { useTitle } from "./Lens";
import styles from "./Legal.module.css";

export default function LegalView({ kind, contact }: { kind: "privacy" | "terms"; contact: string | null }) {
  const { locale } = useLocale();
  const legal = legalUi[locale];
  const doc = legal[kind];
  const { flights } = useArchive();
  useTitle(doc.title);
  useScene(useMemo<Scene>(() => ({ flights, focus: [], camera: { kind: "world" }, cameraKey: "legal" }), [flights]));
  const other = kind === "privacy" ? "terms" : "privacy";
  return (
    <article className={styles.doc}>
      <h1>{doc.title}</h1>
      <p className={styles.updated}>{doc.updated}</p>
      {doc.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>
      ))}
      {contact ? <p className={styles.contact}>{legal.contact(contact)}</p> : null}
      <p className={styles.other}><Link href={`/${other}`}>{legal.other[other]}</Link></p>
    </article>
  );
}
