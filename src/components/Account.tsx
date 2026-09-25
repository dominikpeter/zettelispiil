"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/prefs";
import { signIn, signOut, useAiStatus, type Provider } from "@/lib/aiAccess";
import { press } from "@/lib/ui";

// provider marks, drawn small and in their own colors as the providers ask for
/* eslint-disable shadcn/no-raw-colors -- brand colors are fixed by Google and Microsoft, not part of our theme */
function Mark({ p }: { p: Provider }) {
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

const NAME: Record<Provider, string> = { google: "Google", github: "GitHub", microsoft: "Microsoft" };

/** sign-in buttons, or who is signed in; renders nothing when sign-in isn't set up */
export function Account({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const s = useAiStatus();
  const [err, setErr] = useState("");
  const go = async (p: Provider) => {
    setErr("");
    // on success the page navigates to the provider; an answer here means it didn't
    const r = await signIn(p).catch(() => ({ error: { status: 0 } }));
    if (r?.error) setErr(r.error.status === 429 ? t.rate_limited : t.offline);
  };
  if (!s?.login) return null;
  if (s.user)
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-muted">
          {t.signedInAs} <b className="truncate text-ink">{s.user.name || s.user.email}</b>
        </p>
        <button type="button" onClick={signOut} className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-raised hover:text-ink ${press}`}>
          <LogOut className="size-4" aria-hidden /> {t.signOut}
        </button>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      {!compact && <p className="text-sm text-muted">{t.signInNote}</p>}
      <div className={`grid gap-2 ${compact ? "grid-cols-3" : ""}`}>
        {s.providers.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => go(p)}
            aria-label={t.signInWith(NAME[p])}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-3 font-semibold text-ink hover:bg-raised ${press}`}
          >
            <Mark p={p} />
            {compact ? NAME[p] : t.signInWith(NAME[p])}
          </button>
        ))}
      </div>
      {err && <p role="alert" className="enter text-sm font-medium text-hi">{err}</p>}
    </div>
  );
}
