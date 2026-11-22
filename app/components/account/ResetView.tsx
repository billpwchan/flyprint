"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { accountUi, errorText } from "../../lib/copy-account";
import { publicUi } from "../../lib/copy-public";
import { useLocale } from "../LocaleProvider";
import { useArchive } from "../ArchiveProvider";
import { useScene, type Scene } from "../stage/StageContext";
import { useTitle } from "../common/Lens";
import { call, reload } from "./api";
import styles from "./Account.module.css";

// A forgotten password: ask for a link by mail, then, from the link, choose a new one.
export default function ResetView({ token }: { token: string | null }) {
  const { locale } = useLocale();
  const text = accountUi[locale];
  const words = publicUi[locale].reset;
  const { flights } = useArchive();
  const [value, setValue] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useTitle(token ? words.newTitle : words.title);
  useScene(useMemo<Scene>(() => ({ flights, focus: null, camera: { kind: "world" }, cameraKey: "auth" }), [flights]));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = token
      ? await call("/api/auth/reset/confirm", { body: { token, password: value } })
      : await call("/api/auth/reset", { body: { email: value } });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    if (token) reload("/");
    else setSent(value.trim());
  };

  if (sent) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>{words.title}</h1>
        <p className={styles.lead}>{words.sent(sent)}</p>
        <p className={styles.switch}><Link href="/login">{text.auth.signIn}</Link></p>
      </div>
    );
  }
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{token ? words.newTitle : words.title}</h1>
      <p className={styles.lead}>{token ? words.newLead : words.lead}</p>
      <form className={styles.form} onSubmit={submit} noValidate>
        <label className={styles.field}>
          <span>{token ? text.auth.newPassword : text.auth.email}</span>
          {token
            ? <input className={styles.input} type="password" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="new-password" required minLength={8} aria-invalid={error ? "true" : undefined} />
            : <input className={styles.input} type="email" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="email" inputMode="email" autoCapitalize="off" spellCheck={false} required aria-invalid={error ? "true" : undefined} />}
        </label>
        <p className={styles.error} role="alert" aria-live="polite">{errorText(text, error)}{error === "expired" ? <> <Link href="/reset">{words.send}</Link></> : null}</p>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={busy || !value}>{busy ? text.auth.working : token ? words.save : words.send}</button>
        </div>
      </form>
    </div>
  );
}
