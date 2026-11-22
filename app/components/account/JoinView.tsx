"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { accountUi, errorText } from "../../lib/copy-account";
import { ui } from "../../lib/copy";
import { useLocale } from "../LocaleProvider";
import { useArchive } from "../ArchiveProvider";
import { useScene, type Scene } from "../stage/StageContext";
import { useTitle } from "../common/Lens";
import { call } from "./api";
import styles from "./Account.module.css";

type State = "gone" | "self" | "linked" | "ready" | "signed-out";

// Someone opened an invite link: who sent it, what linking means, and one
// way forward (accept, or sign in or up first and come back here).
export default function JoinView({ token, state, inviter }: { token: string; state: State; inviter: { id: string; name: string } | null }) {
  const { locale } = useLocale();
  const text = accountUi[locale];
  const router = useRouter();
  const { flights } = useArchive();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = `/join/${encodeURIComponent(token)}`;
  useTitle(inviter && state !== "gone" ? text.join.title(inviter.name) : text.join.gone);
  useScene(useMemo<Scene>(() => ({ flights, focus: null, camera: { kind: "world" }, cameraKey: "join" }), [flights]));

  const accept = async () => {
    setBusy(true);
    setError(null);
    const result = await call<{ with: string }>("/api/links", { body: { action: "join", token } });
    if (!result.ok) { setBusy(false); setError(result.error); return; }
    router.push(`/with/${encodeURIComponent(result.data.with)}`);
    router.refresh();
  };

  if (!inviter || state === "gone") {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{text.join.gone}</h1>
        <p className={styles.lead}>{text.join.goneLead}</p>
        <div className={styles.actions}><Link href="/" className={styles.quiet}>{text.join.home}</Link></div>
      </div>
    );
  }
  if (state === "self") {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{text.join.self}</h1>
        <p className={styles.lead}>{text.join.selfLead}</p>
        <div className={styles.actions}><Link href="/settings#links" className={styles.quiet}>{text.menu.settings}</Link></div>
      </div>
    );
  }
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{text.join.title(inviter.name)}</h1>
      <p className={styles.lead}>{text.join.lead}</p>
      <div className={styles.actions} style={{ marginTop: 28 }}>
        {state === "linked" ? (
          <Link href={`/with/${encodeURIComponent(inviter.id)}`} className={styles.primary}>{ui[locale].pair.title(inviter.name)}</Link>
        ) : state === "ready" ? (
          <button type="button" className={styles.primary} onClick={accept} disabled={busy}>{busy ? text.join.working : text.join.accept}</button>
        ) : (
          <>
            <Link href={`/login?next=${encodeURIComponent(here)}`} className={styles.primary}>{text.join.signIn}</Link>
            <Link href={`/signup?next=${encodeURIComponent(here)}`} className={styles.quiet}>{text.join.signUp}</Link>
          </>
        )}
      </div>
      {error ? <p className={styles.error}>{errorText(text, error)}</p> : null}
    </div>
  );
}
