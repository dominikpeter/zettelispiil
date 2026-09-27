"use client";

import { LogOut, Mail, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useT } from "@/lib/prefs";
import { deleteAccount, sendCode, signIn, signInWithCode, signOut, useAiStatus, warmAuth, type Provider } from "@/lib/aiAccess";
import { Confirm } from "@/components/game/common";
import { hasAppleSignIn, isNative } from "@/lib/native";
import { field, press } from "@/lib/ui";

// provider marks, drawn small and in their own colors as the providers ask for
/* eslint-disable shadcn/no-raw-colors -- brand colors are fixed by Google and Microsoft, not part of our theme */
function Mark({ p }: { p: Social }) {
  if (p === "apple")
    return (
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
        <path d="M16.4 12.7c0-2.7 2.2-4 2.3-4a5 5 0 0 0-3.9-2.1c-1.7-.2-3.2 1-4.1 1-.9 0-2.2-1-3.6-.9a5.3 5.3 0 0 0-4.5 2.7c-1.9 3.3-.5 8.3 1.4 11 .9 1.3 2 2.8 3.4 2.8 1.4-.1 1.9-.9 3.5-.9 1.7 0 2.1.9 3.6.9 1.5 0 2.4-1.3 3.3-2.7a11 11 0 0 0 1.5-3.1 4.8 4.8 0 0 1-2.9-4.7zM13.6 4.6A4.8 4.8 0 0 0 14.7 1a4.9 4.9 0 0 0-3.2 1.7 4.6 4.6 0 0 0-1.2 3.4c1.2.1 2.4-.6 3.3-1.5z" />
      </svg>
    );
  if (p === "google")
    return (
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
      </svg>
    );
  if (p === "microsoft")
    return (
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
        <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
        <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
        <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}

type Social = Exclude<Provider, "email">;
const NAME: Record<Social, string> = { apple: "Apple", google: "Google", github: "GitHub", microsoft: "Microsoft" };

/** sign-in buttons, or who is signed in; renders nothing when sign-in isn't set up */
const noop = () => () => {};

export function Account() {
  const t = useT();
  const s = useAiStatus();
  // in the phone apps: Sign in with Apple (natively, when the app build has it) and the e-mail code. Google & co. would
  // open a web page Google refuses inside apps, and would need Apple next to them anyway (App Review 4.8)
  const inApp = useSyncExternalStore(noop, isNative, () => false);
  const appleHere = useSyncExternalStore(noop, hasAppleSignIn, () => false);
  const [err, setErr] = useState("");
  const [asking, setAsking] = useState(false);
  const go = async (p: Social) => {
    setErr("");
    // on success the page navigates to the provider (or, Apple in the app, signs in right here); an answer here means
    // it didn't: no connection, too many tries, or the server refused the sign-in
    const r = await signIn(p).catch(() => ({ error: { status: 0 } }));
    if (r?.error) setErr(r.error.status === 429 ? t.rate_limited : r.error.status ? t.signInFailed : t.offline);
  };
  const remove = async () => {
    setAsking(false);
    setErr("");
    await deleteAccount().catch(() => setErr(t.deleteFailed));
  };
  if (!s?.login) return null;
  if (s.user)
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-raised py-1 pr-1 pl-4">
          <p className="min-w-0 truncate text-sm text-muted">
            {t.signedInAs} <b className="truncate text-ink">{s.user.name || s.user.email}</b>
          </p>
          <button type="button" onPointerDown={warmAuth} onClick={signOut} className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-surface hover:text-ink ${press}`}>
            <LogOut className="size-4" aria-hidden /> {t.signOut}
          </button>
        </div>
        {/* App Review 5.1.1(v): an app that creates accounts lets people delete them in the app */}
        <button type="button" onClick={() => setAsking(true)} className={`flex min-h-11 items-center gap-1.5 self-start rounded-xl px-3 text-sm font-semibold text-muted hover:bg-surface hover:text-ink ${press}`}>
          <Trash2 className="size-3.5" aria-hidden /> {t.deleteAccount}
        </button>
        {err && <p role="alert" className="enter text-sm font-medium text-hi">{err}</p>}
        {asking && <Confirm text={t.deleteAccountAsk} yes={t.deleteAccount} no={t.keepAccount} onYes={remove} onNo={() => setAsking(false)} />}
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">{t.signInNote}</p>
      <div className="grid gap-2">
        {s.providers.filter((p): p is Social => p !== "email" && (!inApp || (p === "apple" && appleHere))).map((p) => (
          <button
            key={p}
            type="button"
            onPointerDown={warmAuth}
            onClick={() => go(p)}
            aria-label={t.signInWith(NAME[p])}
            className={option}
          >
            <Mark p={p} />
            {t.signInWith(NAME[p])}
          </button>
        ))}
      </div>
      {err && <p role="alert" className="enter text-sm font-medium text-hi">{err}</p>}
      {s.providers.includes("email") && <EmailCode />}
    </div>
  );
}

const option = `flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-3 font-semibold text-ink hover:bg-raised disabled:opacity-40 ${press}`;

/** sign in without a provider: a six-digit code by email (a code, not a link: a link would open the browser, not this app) */
function EmailCode() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fail = (status?: number) => setErr(status === 429 ? t.rate_limited : status === 400 || status === 403 ? t.codeWrong : t.offline);
  const send = async () => {
    setBusy(true);
    setErr("");
    const r = await sendCode(email.trim()).catch(() => ({ error: { status: 0 } }));
    setBusy(false);
    if (r.error) fail(r.error.status);
    else setSent(true);
  };
  const verify = async () => {
    setBusy(true);
    setErr("");
    const r = await signInWithCode(email.trim(), code).catch(() => ({ error: { status: 0 } }));
    setBusy(false);
    if (r.error) fail(r.error.status === 429 || r.error.status === 0 ? r.error.status : 400); // anything else: the code was refused
  };
  return (
    <form
      className="mt-1 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void (sent ? verify() : send());
      }}
    >
      <p className="text-center text-sm text-muted">{t.orEmail}</p>
      {!sent ? (
        <>
          <input type="email" required value={email} onPointerDown={warmAuth} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailAddress} aria-label={t.emailAddress} autoComplete="email" spellCheck={false} autoCapitalize="none" className={field} />
          <button disabled={busy || !email.includes("@")} className={option}>
            <Mail className="size-5" aria-hidden /> {t.sendCode}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">{t.codeSent(email.trim())}</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            aria-label={t.codeLabel}
            className={`${field} text-center text-2xl font-bold tracking-[0.4em]`}
          />
          <button disabled={busy || code.length !== 6} className={option}>
            {t.codeSignIn}
          </button>
          <button type="button" onClick={() => (setSent(false), setCode(""), setErr(""))} className={`min-h-11 self-center rounded-xl px-3 text-sm text-muted underline underline-offset-4 hover:text-ink ${press}`}>
            {t.otherEmail}
          </button>
        </>
      )}
      {err && <p role="alert" className="enter text-sm font-medium text-hi">{err}</p>}
    </form>
  );
}
