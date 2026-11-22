"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { accountUi, errorText } from "../../lib/copy-account";
import { publicUi } from "../../lib/copy-public";
import { formatNumber } from "../../lib/copy";
import { useLocale } from "../LocaleProvider";
import { useArchive, useViewer } from "../ArchiveProvider";
import { useScene, type Scene } from "../stage/StageContext";
import { useTitle } from "../common/Lens";
import { call, reload } from "./api";
import styles from "./Account.module.css";

// Sign in and create an account: two fields (three to sign up), one button,
// and the way to the other form beneath.
export default function AuthView({ mode, next, canReset }: { mode: "signin" | "signup"; next: string; canReset: boolean }) {
  const { locale } = useLocale();
  const text = accountUi[locale];
  const words = publicUi[locale];
  const { flights, all } = useArchive();
  const viewer = useViewer();
  // From a trial with flights: signing up keeps them, signing in brings them along.
  const kept = viewer?.trial != null && all.length ? formatNumber(all.length, locale) : null;
  const signup = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = signup ? (kept ? text.auth.keepTitle : text.auth.signUpTitle) : text.auth.signInTitle;
  useTitle(title);
  useScene(useMemo<Scene>(() => ({ flights, focus: null, camera: { kind: "world" }, cameraKey: "auth" }), [flights]));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await call(signup ? "/api/auth/signup" : "/api/auth/login", { body: signup ? { email, password, name } : { email, password } });
    // A new account goes on to import, unless it came here to accept an invitation
    // or already has a trial's flights.
    if (result.ok) { reload(signup && next === "/" && !kept ? "/import" : next); return; }
    setError(result.error);
    setBusy(false);
  };

  const invalid = (codes: string[]) => (error && codes.includes(error) ? "true" : undefined);
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.lead}>{kept ? (signup ? text.auth.keepLead : text.auth.mergeLead)(kept) : signup ? text.auth.signUpLead : text.auth.signInLead}</p>
      <form className={styles.form} onSubmit={submit} noValidate>
        {signup ? (
          <label className={styles.field}>
            <span>{text.auth.name}</span>
            <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder={text.auth.namePlaceholder} autoComplete="nickname" maxLength={40} aria-invalid={invalid(["name"])} />
          </label>
        ) : null}
        <label className={styles.field}>
          <span>{text.auth.email}</span>
          <input className={styles.input} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" autoCapitalize="off" spellCheck={false} required aria-invalid={invalid(["email", "taken", "credentials", "unknown"])} />
        </label>
        <label className={styles.field}>
          <span>{signup ? text.auth.newPassword : text.auth.password}</span>
          <input className={styles.input} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 8 : undefined} aria-invalid={invalid(["password_short", "password_long", "credentials"])} />
          {!signup && canReset ? <Link href="/reset" className={styles.forgot}>{words.reset.forgot}</Link> : null}
        </label>
        <p className={styles.error} role="alert" aria-live="polite">{errorText(text, error)}</p>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={busy || !email || !password}>{busy ? text.auth.working : signup ? (kept ? text.trial.keep : text.auth.signUp) : text.auth.signIn}</button>
        </div>
        {signup ? <Consent parts={words.legal.agree} /> : null}
      </form>
      <p className={styles.switch}>
        {signup ? text.auth.toSignIn : text.auth.toSignUp}
        <Link href={signup ? `/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}` : `/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>{signup ? text.auth.toSignInLink : text.auth.toSignUpLink}</Link>
      </p>
    </div>
  );
}

export function Consent({ parts }: { parts: [string, string, string, string, string] }) {
  const [before, terms, between, privacy, after] = parts;
  return (
    <p className={styles.fine}>
      {before}<Link href="/terms" className={styles.inline}>{terms}</Link>{between}<Link href="/privacy" className={styles.inline}>{privacy}</Link>{after}
    </p>
  );
}
