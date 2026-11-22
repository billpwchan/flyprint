"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Copy, Download, ExternalLink, Link2, Share } from "lucide-react";
import { publicUi } from "../../lib/copy-public";
import { accountUi, errorText, type AccountCopy } from "../../lib/copy-account";
import { formatDate, formatNumber } from "../../lib/copy";
import type { Locale } from "../../lib/i18n";
import { useLocale } from "../LocaleProvider";
import { useArchive } from "../ArchiveProvider";
import { planUi } from "../../lib/copy-plan";
import { palette } from "../../lib/palette";
import type { Sharing } from "../../lib/data";
import { useScene, type Scene } from "../stage/StageContext";
import { useTitle } from "../common/Lens";
import { call, reload } from "./api";
import styles from "./Account.module.css";

type Person = { id: string; name: string; label: string; email: string };
type ImportSummary = { id: string; createdAt: number; status: "reading" | "ready" | "failed" | "saved" | "undone" | "discarded"; sources: { name: string }[]; added: number; updated?: number; removed?: number };
type Linked = Person & { tone: number; mine: Sharing; theirs: Sharing };
type Account = { user: Person & { flights: number; tone: number }; links: Linked[]; sent: Person[]; received: Person[]; imports: ImportSummary[] };

// Everything about the account on one page, in the order people look for it:
// who they are, who they are linked with, what they imported, their data,
// and last the password and the way out.
export default function SettingsView() {
  const { locale } = useLocale();
  const text = accountUi[locale];
  const { flights, ahead } = useArchive();
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  useTitle(text.settings.title);
  useScene(useMemo<Scene>(() => ({ flights, focus: null, camera: { kind: "world" }, cameraKey: "settings" }), [flights]));

  const load = useCallback(() => call<Account>("/api/account").then((result) => {
    if (result.ok) setAccount(result.data);
    else if (result.status === 401) reload("/login?next=/settings");
    else setError(result.error);
  }), []);
  useEffect(() => { void load(); }, [load]);
  // The menu's invitation entry points at the links section.
  const loaded = !!account;
  useEffect(() => {
    if (loaded && window.location.hash === "#links") document.getElementById("links")?.scrollIntoView({ block: "start" });
  }, [loaded]);

  // What changes the flights on screen reloads the archive with it.
  const changed = useCallback(async () => { await load(); router.refresh(); }, [load, router]);

  if (!account) return <div className={styles.page}><p className={styles.error}>{errorText(text, error)}</p></div>;
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{account.user.name}</h1>
      <p className={styles.lead}>{account.user.email} · {text.settings.flights(formatNumber(flights.length, locale))}{ahead.length ? ` · ${planUi[locale].booked(formatNumber(ahead.length, locale))}` : ""}</p>

      <Profile text={text} user={account.user} onSaved={changed} />
      <PublicPage locale={locale} />
      <Links text={text} locale={locale} account={account} onChanged={changed} />
      <Imports text={text} locale={locale} imports={account.imports} onChanged={changed} />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{text.settings.data}</h2>
        <a className={styles.quiet} href="/api/export" download><Download aria-hidden="true" />{text.settings.export}</a>
        <p className={styles.fine}>{text.settings.exportHint}</p>
      </section>

      <Password text={text} />

      <section className={styles.section}>
        <button type="button" className={styles.quiet} onClick={async () => { await call("/api/auth/logout", { method: "POST" }); reload("/"); }}>{text.settings.signOut}</button>
      </section>
      <Close text={text} />
      <p className={styles.fine} style={{ marginTop: 44 }}>
        <Link href="/privacy" className={styles.inline}>{publicUi[locale].legal.privacy}</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/terms" className={styles.inline}>{publicUi[locale].legal.terms}</Link>
      </p>
    </div>
  );
}

const subscribeNothing = () => () => {};
const shareSheetAvailable = () => typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

// The public page: off until turned on, then its address, the picture it
// unfurls into, and ways to send it.
function PublicPage({ locale }: { locale: Locale }) {
  const words = publicUi[locale].share;
  const [share, setShare] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canShare = useSyncExternalStore(subscribeNothing, shareSheetAvailable, () => false);
  useEffect(() => { void call<{ share: string | null }>("/api/account/share").then((result) => setShare(result.ok ? result.data.share : null)); }, []);
  useEffect(() => {
    if (share !== undefined && window.location.hash === "#share") document.getElementById("share")?.scrollIntoView({ block: "start" });
  }, [share]);
  const turn = async (on: boolean) => {
    setBusy(true); setError(null); setArmed(false); setCopied(false);
    const result = await call<{ share: string | null }>("/api/account/share", { body: { on } });
    setBusy(false);
    if (result.ok) setShare(result.data.share); else setError(result.error);
  };
  const url = share ? `${window.location.origin}/s/${share}` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); }
  };
  const send = () => navigator.share({ url }).catch(() => {});
  const accountText = accountUi[locale];
  return (
    <section id="share" className={styles.section}>
      <h2 className={styles.sectionTitle}>{words.title}</h2>
      <p className={styles.note}>{words.lead}</p>
      {share === undefined ? null : share ? (
        <>
          <a href={`/s/${share}`} target="_blank" rel="noreferrer" className={styles.preview}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a generated picture, already sized */}
            <img src={`/api/share/${share}/image`} alt="" width={1200} height={630} />
          </a>
          <p className={`${styles.address} ${styles.mono}`}>{url.replace(/^https?:\/\//, "")}</p>
          <div className={styles.actions}>
            {canShare
              ? <button type="button" className={styles.primary} onClick={send}><Share aria-hidden="true" />{words.send}</button>
              : <button type="button" className={styles.primary} onClick={copy}><Copy aria-hidden="true" />{copied ? words.copied : words.copy}</button>}
            {canShare ? <button type="button" className={styles.quiet} onClick={copy}><Copy aria-hidden="true" />{copied ? words.copied : words.copy}</button> : null}
            <a className={styles.quiet} href={`/s/${share}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />{words.open}</a>
            <button type="button" className={`${styles.quiet} ${armed ? styles.danger : ""}`} disabled={busy} onBlur={() => setArmed(false)}
              onClick={() => armed ? turn(false) : setArmed(true)}>{armed ? words.offConfirm : words.off}</button>
          </div>
          <p className={styles.fine} style={{ marginTop: 6 }}>{words.offHint}</p>
        </>
      ) : (
        <div className={styles.actions} style={{ marginTop: 16 }}>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => turn(true)}><Link2 aria-hidden="true" />{busy ? words.working : words.on}</button>
        </div>
      )}
      {error ? <p className={styles.error} style={{ marginTop: 10 }}>{errorText(accountText, error)}</p> : null}
    </section>
  );
}

function Profile({ text, user, onSaved }: { text: AccountCopy; user: Account["user"]; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [tone, setTone] = useState(user.tone);
  const [state, setState] = useState<{ busy: boolean; error: string | null; saved: boolean }>({ busy: false, error: null, saved: false });
  const dirty = name !== user.name;
  const save = async (body: { name?: string; tone?: number }) => {
    setState({ busy: true, error: null, saved: false });
    const result = await call("/api/account", { method: "PATCH", body });
    setState({ busy: false, error: result.ok ? null : result.error, saved: result.ok });
    if (result.ok) onSaved();
  };
  const pick = (value: number) => {
    if (value === tone) return;
    setTone(value);
    void save({ tone: value });
  };
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{text.settings.profile}</h2>
      <form className={styles.form} style={{ marginTop: 0 }} onSubmit={(event) => { event.preventDefault(); void save({ name }); }}>
        <label className={styles.field}>
          <span>{text.settings.name}</span>
          <input className={styles.input} value={name} onChange={(event) => { setName(event.target.value); setState((current) => ({ ...current, saved: false })); }} maxLength={40} autoComplete="nickname" />
        </label>
        <div className={styles.field}>
          <span id="tone-label">{text.settings.tone}</span>
          <div className={styles.tones} role="radiogroup" aria-labelledby="tone-label">
            {palette.tones.map((color, index) => (
              <button key={color} type="button" role="radio" aria-checked={tone === index} aria-label={text.settings.toneName(index + 1)} style={{ "--tone": color } as React.CSSProperties} onClick={() => pick(index)} disabled={state.busy} />
            ))}
          </div>
          <small>{text.settings.toneHint}</small>
        </div>
        {dirty || state.saved || state.error ? (
          <div className={styles.actions}>
            {dirty ? <button type="submit" className={styles.primary} disabled={state.busy || !name.trim()}>{text.settings.save}</button> : null}
            {state.saved ? <span className={styles.ok}>{text.settings.saved}</span> : null}
            {state.error ? <span className={styles.error}>{errorText(text, state.error)}</span> : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}

function Links({ text, locale, account, onChanged }: { text: AccountCopy; locale: Locale; account: Account; onChanged: () => void }) {
  const { links: summaries } = useArchive();
  const together = new Map(summaries.map((link) => [link.id, link.together]));
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ busy: boolean; error: string | null; done: string | null }>({ busy: false, error: null, done: null });
  const [armed, setArmed] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ state: "idle" | "making" | "copied" | "shown"; url: string }>({ state: "idle", url: "" });
  const act = async (body: Record<string, string>, done: string | null = null) => {
    setState({ busy: true, error: null, done: null });
    const result = await call<{ result?: string }>("/api/links", { body });
    setState({ busy: false, error: result.ok ? null : result.error, done: result.ok ? (result.data.result === "linked" ? text.settings.linked : done) : null });
    setArmed(null);
    if (result.ok) { setEmail(""); onChanged(); }
  };
  const makeLink = async () => {
    setInvite({ state: "making", url: "" });
    const result = await call<{ token: string }>("/api/links", { body: { action: "token" } });
    if (!result.ok) { setInvite({ state: "idle", url: "" }); setState({ busy: false, error: result.error, done: null }); return; }
    const url = `${window.location.origin}/join/${result.data.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setInvite({ state: "copied", url });
    } catch {
      setInvite({ state: "shown", url });
    }
  };
  const { links, sent, received } = account;
  return (
    <section id="links" className={styles.section}>
      <h2 className={styles.sectionTitle}>{text.settings.links}</h2>
      <p className={styles.note}>{text.settings.linksLead}</p>
      {received.length || links.length || sent.length ? (
        <div className={styles.rows} style={{ marginTop: 14 }}>
          {received.map((person) => (
            <div key={person.id} className={styles.row}>
              <div><strong>{person.name}</strong><span>{text.settings.invitedBy(person.email)}</span></div>
              <span className={styles.rowActions}>
                <button type="button" disabled={state.busy} onClick={() => act({ action: "accept", from: person.id })}>{text.settings.accept}</button>
                <button type="button" disabled={state.busy} onClick={() => act({ action: "decline", from: person.id })}>{text.settings.decline}</button>
              </span>
            </div>
          ))}
          {links.map((link) => (
            <div key={link.id} className={styles.row}>
              <div>
                <strong className={styles.person} style={{ "--tone": palette.tones[link.tone] } as React.CSSProperties}><i aria-hidden="true" />{link.name}</strong>
                <span>{[link.email, together.has(link.id) ? text.settings.together(formatNumber(together.get(link.id)!, locale)) : null].filter(Boolean).join(" · ")}</span>
              </div>
              <span className={styles.rowActions}>
                <Link href={`/with/${encodeURIComponent(link.id)}`}>{text.settings.open}</Link>
                <button type="button" disabled={state.busy} data-armed={armed === link.id ? "true" : undefined} onBlur={() => setArmed((current) => current === link.id ? null : current)}
                  onClick={() => armed === link.id ? act({ action: "unlink", with: link.id }) : setArmed(link.id)}>
                  {armed === link.id ? text.settings.unlinkConfirm : text.settings.unlink}
                </button>
              </span>
            </div>
          ))}
          {sent.map((person) => (
            <div key={person.id} className={styles.row}>
              <div><strong>{person.name}</strong><span>{text.settings.waiting(person.email)}</span></div>
              <button type="button" disabled={state.busy} onClick={() => act({ action: "cancel", to: person.id })}>{text.settings.cancel}</button>
            </div>
          ))}
        </div>
      ) : null}
      <form className={styles.form} style={{ marginTop: 18 }} onSubmit={(event) => { event.preventDefault(); void act({ action: "invite", email }, text.settings.invited); }}>
        <label className={styles.field}>
          <span>{text.settings.linkEmail}</span>
          <input className={styles.input} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" inputMode="email" autoCapitalize="off" spellCheck={false} />
        </label>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={state.busy || !email.includes("@")}>{text.settings.invite}</button>
          <button type="button" className={styles.quiet} onClick={makeLink} disabled={invite.state === "making"}><Link2 aria-hidden="true" />{invite.state === "making" ? text.settings.inviteLinkMaking : text.settings.inviteLink}</button>
        </div>
      </form>
      {invite.state === "copied" ? <p className={styles.ok} style={{ marginTop: 10 }}>{text.settings.inviteLinkCopied}</p>
        : invite.state === "shown" ? (
          <div className={styles.field} style={{ marginTop: 12 }}>
            <span>{text.settings.inviteLinkShown}</span>
            <input className={`${styles.input} ${styles.mono}`} value={invite.url} readOnly onFocus={(event) => event.currentTarget.select()} />
          </div>
        ) : <p className={styles.fine} style={{ marginTop: 10 }}>{text.settings.inviteLinkHint}</p>}
      {state.done ? <p className={styles.ok} style={{ marginTop: 10 }}>{state.done}</p> : null}
      {state.error ? <p className={styles.error} style={{ marginTop: 10 }}>{errorText(text, state.error)}</p> : null}
    </section>
  );
}

function Imports({ text, locale, imports, onChanged }: { text: AccountCopy; locale: Locale; imports: ImportSummary[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const undo = async (id: string) => {
    setBusy(id);
    await call(`/api/imports/${id}`, { method: "DELETE" });
    setBusy(null);
    onChanged();
  };
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{text.settings.imports}</h2>
      {imports.length ? (
        <div className={styles.rows}>
          {imports.map((item) => (
            <div key={item.id} className={styles.row}>
              <div>
                <strong>{item.sources.map((source) => source.name).join("、")}</strong>
                <span>{formatDate(new Date(item.createdAt).toISOString().slice(0, 10), locale)} · {text.settings.importStatus[item.status]}{item.status === "saved" ? ` · ${[item.added || !(item.updated || item.removed) ? text.settings.added(formatNumber(item.added, locale)) : "", item.updated ? text.settings.updated(formatNumber(item.updated, locale)) : "", item.removed ? text.settings.removed(formatNumber(item.removed, locale)) : ""].filter(Boolean).join(" · ")}` : ""}</span>
              </div>
              {item.status === "saved" ? <button type="button" disabled={busy === item.id} onClick={() => undo(item.id)}>{text.settings.undo}</button>
                : item.status === "ready" || item.status === "reading" ? <Link href={`/import?id=${item.id}`}>{text.settings.review}</Link> : null}
            </div>
          ))}
        </div>
      ) : <p className={styles.note}>{text.settings.noImports}</p>}
    </section>
  );
}

function Password({ text }: { text: AccountCopy }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<{ busy: boolean; error: string | null; done: boolean }>({ busy: false, error: null, done: false });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState({ busy: true, error: null, done: false });
    const result = await call("/api/account/password", { body: { current, next } });
    setState({ busy: false, error: result.ok ? null : result.error, done: result.ok });
    if (result.ok) { setCurrent(""); setNext(""); }
  };
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{text.settings.password}</h2>
      <form className={styles.form} style={{ marginTop: 0 }} onSubmit={submit}>
        <input type="email" autoComplete="username" hidden readOnly />
        <label className={styles.field}>
          <span>{text.settings.current}</span>
          <input className={styles.input} type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" />
        </label>
        <label className={styles.field}>
          <span>{text.settings.next}</span>
          <input className={styles.input} type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" />
        </label>
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={state.busy || !current || next.length < 8}>{text.settings.change}</button>
          {state.done ? <span className={styles.ok}>{text.settings.changed}</span> : null}
          {state.error ? <span className={styles.error}>{errorText(text, state.error)}</span> : null}
        </div>
      </form>
    </section>
  );
}

function Close({ text }: { text: AccountCopy }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState({ busy: true, error: null });
    const result = await call("/api/account", { method: "DELETE", body: { password } });
    if (result.ok) { reload("/"); return; }
    setState({ busy: false, error: result.error });
  };
  return (
    <section className={styles.section} style={{ marginTop: 8 }}>
      {open ? (
        <form className={styles.form} style={{ marginTop: 0 }} onSubmit={submit}>
          <p className={styles.note}>{text.settings.closeLead}</p>
          <label className={styles.field}>
            <span>{text.settings.closeConfirm}</span>
            <input className={styles.input} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          <div className={styles.actions}>
            <button type="submit" className={`${styles.quiet} ${styles.danger}`} disabled={state.busy || !password}>{text.settings.closeAction}</button>
            <button type="button" className={styles.quiet} onClick={() => setOpen(false)}>{text.settings.keep}</button>
          </div>
          {state.error ? <p className={styles.error}>{errorText(text, state.error)}</p> : null}
        </form>
      ) : <button type="button" className={`${styles.quiet} ${styles.danger}`} onClick={() => setOpen(true)}>{text.settings.close}</button>}
    </section>
  );
}
