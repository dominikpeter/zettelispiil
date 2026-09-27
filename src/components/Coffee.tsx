"use client";

import { Coffee as Cup } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { COFFEES, MAX_CHF, iapId } from "@/lib/coffee";
import { coffeeIap, hasCoffeeIap, isNative } from "@/lib/native";
import { langPref, useT } from "@/lib/prefs";
import { field, press } from "@/lib/ui";

const CUP = { small: "size-4", big: "size-5", deluxe: "size-6" } as const; // the bigger the coffee, the bigger the cup
const noop = () => () => {};

/**
 * "buy me a coffee" in the settings sheet: off to Stripe's payment page and back. Only when Stripe is set up. The
 * phone apps may not take tips through Stripe (the stores want their own payment): the iPhone app sells the coffees
 * as In-App Purchases instead (AppCoffee), other app builds show nothing.
 */
export function Coffee() {
  const t = useT();
  const inApp = useSyncExternalStore(noop, isNative, () => true);
  const iap = useSyncExternalStore(noop, hasCoffeeIap, () => false);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // back from Stripe with the back button, the browser shows this page as it was left (buttons still busy): free them again,
  // so another coffee can always be bought
  useEffect(() => {
    const again = () => setBusy(false);
    addEventListener("pageshow", again);
    return () => removeEventListener("pageshow", again);
  }, []);
  if (iap) return <AppCoffee />;
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
      <CoffeeHead />
      <Cups busy={busy} price={(c) => `CHF ${c.chf}`} onBuy={(c) => buy(c.chf)} />
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

type Size = (typeof COFFEES)[number];
function CoffeeHead() {
  const t = useT();
  return (
    <>
      <h3 className="flex items-center gap-2 font-semibold">
        <Cup className="size-4 shrink-0 text-accent" aria-hidden /> {t.coffeeTitle}
      </h3>
      <p className="text-sm leading-snug text-muted">{t.coffeeNote}</p>
    </>
  );
}

/** the three coffees as cards, the bigger the cup the bigger the coffee */
function Cups({ busy, price, onBuy }: { busy: boolean; price: (c: Size) => string; onBuy: (c: Size) => void }) {
  const t = useT();
  return (
    <div className="grid grid-cols-3 gap-2">
      {COFFEES.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={busy}
          onClick={() => onBuy(c)}
          aria-label={`${t[`coffee_${c.id}`]}, ${price(c)}`}
          className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface px-1 text-center disabled:opacity-50 ${press}`}
        >
          <Cup className={`${CUP[c.id]} text-accent`} aria-hidden />
          <span className="text-sm leading-tight font-semibold">{t.coffeeSize[c.id]}</span>
          <span className="text-sm text-muted tabular-nums">{price(c)}</span>
        </button>
      ))}
    </div>
  );
}

/** in the iPhone app: the coffees as In-App Purchases, in the player's App Store currency. Hidden until Apple has the products */
function AppCoffee() {
  const t = useT();
  const [prices, setPrices] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    coffeeIap()
      .then((p) => p.products({ ids: COFFEES.map((c) => iapId(c.id)) }))
      .then(({ products }) => setPrices(Object.fromEntries(products.map((p) => [p.id, p.price]))))
      .catch(() => setPrices({}));
  }, []);
  if (!prices || COFFEES.some((c) => !prices[iapId(c.id)])) return null; // not (yet) approved in App Store Connect
  const buy = async (c: Size) => {
    setBusy(true);
    setMsg(null);
    try {
      const { status } = await (await coffeeIap()).buy({ id: iapId(c.id) });
      if (status === "purchased") setMsg({ ok: true, text: t.coffeeThanks });
    } catch {
      setMsg({ ok: false, text: t.coffeeFailed });
    }
    setBusy(false);
  };
  return (
    <section className="flex flex-col gap-2">
      <CoffeeHead />
      <Cups busy={busy} price={(c) => prices[iapId(c.id)]} onBuy={buy} />
      <p className="text-xs text-muted">{t.coffeePaidApple}</p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`enter text-sm font-medium ${msg.ok ? "text-accent" : "text-hi"}`}>{msg.text}</p>}
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
      className="enter pointer-events-auto fixed inset-x-4 top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-accent px-4 py-3 text-left font-semibold text-canvas shadow-lg"
    >
      <Cup className="size-6 shrink-0" aria-hidden />
      <span role="status">{t.coffeeThanks}</span>
    </button>
  );
}
