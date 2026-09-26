"use client";

import { Download, Share, SquarePlus, type LucideIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { isNative } from "@/lib/native";
import { useT } from "@/lib/prefs";
import { ghost, press } from "@/lib/ui";

// "Zettelispiil as an app": on a phone that hasn't installed it yet. Android/Chrome hand us an install prompt to call;
// iPhones have none, so they get the two taps to do it by hand. It asks once per phone: after any choice
// (installed, or «Später») it never comes back.
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const KEY = "install-hint-done";
let deferred: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const remember = () => {
  try {
    localStorage.setItem(KEY, "1");
  } catch {}
};

// registered as soon as this module loads: Chrome may fire the event before React is up
if (typeof window !== "undefined") {
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // no mini-infobar: our banner asks instead
    deferred = e as InstallPrompt;
    notify();
  });
  addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    remember();
    notify();
  });
}

type Kind = "prompt" | "ios" | null;
function kind(): Kind {
  if (installed || isNative()) return null;
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (standalone || !matchMedia("(pointer: coarse)").matches) return null; // installed already, or not a phone
  try {
    if (localStorage.getItem(KEY)) return null; // asked once already
  } catch {}
  if (deferred) return "prompt";
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS says Mac
  return ios ? "ios" : null;
}
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

// the big CTA's colours as a pill, sized to sit in a row next to «Später»
const cta = `flex min-h-11 items-center gap-1.5 rounded-full bg-cta px-4 font-bold text-cta-ink shadow-sm ${press}`;

/** one of the two iPhone taps, with the icon Safari shows for it */
function Step({ icon: I, children }: { icon: LucideIcon; children: string }) {
  return (
    <li className="flex items-center gap-2.5 rounded-xl bg-raised px-3 py-2 text-sm font-medium text-ink">
      <I className="size-5 shrink-0 text-accent" aria-hidden />
      {children}
    </li>
  );
}

export function InstallHint() {
  const t = useT();
  const k = useSyncExternalStore(subscribe, kind, () => null);
  const [gone, setGone] = useState(false);
  if (!k || gone) return null;

  const dismiss = () => {
    remember();
    setGone(true);
  };
  const install = async () => {
    const p = deferred;
    if (!p) return;
    await p.prompt();
    await p.userChoice; // installed or declined in the system dialog: either way a choice, so it's done
    deferred = null;
    dismiss();
  };

  // one way out, «Später», next to the action: a corner X on top of it would only be a second, smaller target for the same thing
  return (
    <aside aria-label={t.installTitle} className="enter rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-3">
        {/* the home-screen icon itself, so it's clear what lands there; an SVG, nothing for next/image to optimise */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={44} height={44} className="size-11 shrink-0 rounded-xl shadow-sm" />
        <p className="min-w-0 leading-tight font-bold text-balance text-hi">{t.installTitle}</p>
      </div>
      <p className="mt-2 text-sm leading-snug text-muted">{t.installNote}</p>
      {k === "ios" && (
        <ol className="mt-3 grid gap-1.5">
          <Step icon={Share}>{t.installIosShare}</Step>
          <Step icon={SquarePlus}>{t.installIosAdd}</Step>
        </ol>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-y-2">
        {k === "prompt" && (
          <button type="button" onClick={install} className={cta}>
            <Download className="size-4" aria-hidden />
            {t.installButton}
          </button>
        )}
        <button type="button" onClick={dismiss} className={ghost}>
          {t.installLater}
        </button>
      </div>
    </aside>
  );
}
