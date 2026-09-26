"use client";

import { Coffee as Cup } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { COFFEES, MAX_CHF } from "@/lib/coffee";
import { isNative } from "@/lib/native";
import { langPref, useT } from "@/lib/prefs";
import { field, press } from "@/lib/ui";

const CUP = { small: "size-4", big: "size-5", deluxe: "size-6" } as const; // the bigger the coffee, the bigger the cup
const noop = () => () => {};

/**
 * "buy me a coffee" in the settings sheet: off to Stripe's payment page and back. Only when Stripe is set up,
 * and never inside the phone apps (the stores want their own payment for tips).
 */
export function Coffee() {
  const t = useT();
  const inApp = useSyncExternalStore(noop, isNative, () => true);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!process.env.NEXT_PUBLIC_COFFEE || inApp) return null;

  const buy = async (chf: number) => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/coffee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chf, back: location.pathname + location.search, lang: langPref.get() }),
      });
      const { url } = (await r.json()) as { url?: string };
      if (!r.ok || !url) throw new Error();
      location.assign(url); // Stripe's page; it sends the player back here
    } catch {
      setErr(t.coffeeFailed);
      setBusy(false);
    }
  };
  const own = Number(custom);

  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 font-semibold">
        <Cup className="size-4 shrink-0 text-accent" aria-hidden /> {t.coffeeTitle}
      </h3>
      <p className="text-sm leading-snug text-muted">{t.coffeeNote}</p>
      <div className="grid grid-cols-3 gap-2">
        {COFFEES.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={busy}
            onClick={() => buy(c.chf)}
            aria-label={`${t[`coffee_${c.id}`]}, CHF ${c.chf}`}
            className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface px-1 text-center disabled:opacity-50 ${press}`}
          >
            <Cup className={`${CUP[c.id]} text-accent`} aria-hidden />
            <span className="text-sm leading-tight font-semibold">{t[`coffee_${c.id}`]}</span>
            <span className="text-sm text-muted tabular-nums">CHF {c.chf}</span>
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (own >= 1 && own <= MAX_CHF) void buy(own);
        }}
      >
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 3))}
          inputMode="numeric"
          placeholder="CHF"
          aria-label={t.coffeeCustom}
          className={`${field} min-w-0 flex-1`}
        />
        <button disabled={busy || !(own >= 1 && own <= MAX_CHF)} className={`shrink-0 rounded-2xl bg-accent px-4 font-semibold text-canvas disabled:opacity-40 ${press}`}>
          {t.coffeeGive}
        </button>
      </form>
      <p className="text-xs text-muted">{t.coffeePaid}</p>
      {err && <p role="alert" className="enter text-sm font-medium text-hi">{err}</p>}
    </section>
  );
}

/** back from Stripe after paying: a thank-you, until it's tapped away */
export function CoffeeThanks() {
  const t = useT();
  const back = useSyncExternalStore(noop, () => location.search.includes("coffee=thanks"), () => false);
  const [gone, setGone] = useState(false);
  if (!back || gone) return null;
  return (
    <button
      type="button"
      onClick={() => {
        setGone(true);
        const u = new URL(location.href);
        u.searchParams.delete("coffee");
        history.replaceState(history.state, "", u);
      }}
      className="enter fixed inset-x-4 top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-accent px-4 py-3 text-left font-semibold text-canvas shadow-lg"
    >
      <Cup className="size-6 shrink-0" aria-hidden />
      <span role="status">{t.coffeeThanks}</span>
    </button>
  );
}
