"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import BackLink from "./BackLink";
import { swap } from "../shell/navigation";
import styles from "./common.module.css";

type Target = { href: string; label: string; title: string } | null;

// Back on the left; earlier and later neighbours on the right, also on ← and →,
// after anything the page can do with itself (`actions`, such as sharing it).
// A neighbour takes the place of this screen, so back still returns to where
// the reader came from in one step.
export default function DetailHead({ backHref, backLabel, previous, next, actions }: { backHref: string; backLabel: string; previous: Target; next: Target; actions?: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      const go = event.key === "ArrowLeft" ? previous : event.key === "ArrowRight" ? next : null;
      if (!go) return;
      event.preventDefault();
      swap();
      router.replace(go.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previous, next, router]);
  const step = (target: Target, dir: "previous" | "next") => {
    const Icon = dir === "previous" ? ChevronLeft : ChevronRight;
    return target
      ? <Link href={target.href} replace onClick={swap} aria-label={`${target.label}: ${target.title}`} title={`${target.label} · ${target.title}`} aria-keyshortcuts={dir === "previous" ? "ArrowLeft" : "ArrowRight"}><Icon aria-hidden="true" /></Link>
      : <span aria-hidden="true"><Icon /></span>;
  };
  return (
    <div className={styles.detailHead}>
      <BackLink href={backHref} label={backLabel} />
      <div className={styles.detailActions}>
        {actions}
        {previous || next ? <nav className={styles.pager}>{step(previous, "previous")}{step(next, "next")}</nav> : null}
      </div>
    </div>
  );
}
