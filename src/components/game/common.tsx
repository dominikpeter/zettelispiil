"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAiOn } from "@/lib/aiAccess";
import { useT } from "@/lib/prefs";
import { type Action, type RoundType, type Stroke, type View } from "@/lib/room";
import { panel, press, RoundIcon } from "@/lib/ui";

export type Mode = "online" | "local";
/** `as`: in one-phone games, act as that player; online always acts as this phone's player */
export type Send = (a: Action, as?: number) => Promise<void>;
/** every-phone games: the room code and the drawer's line sender (fire-and-forget) */
export type Live = { code: string; draw: (sheet: number, strokes: Stroke[]) => void };
export type P = { v: View; send: Send; busy: boolean; mode: Mode; live?: Live };

export const mini = `grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink disabled:opacity-25 ${press}`;

export function Waiting({ text }: { text: string }) {
  return (
    <p className="enter flex items-center justify-center gap-2 py-3 text-center text-muted">
      <span className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-accent" /> {text}
    </p>
  );
}

export function Cta({ children }: { children: ReactNode }) {
  // own bottom padding: clears the iPhone home bar and leaves room for the button's 3D edge
  return <div className="sticky bottom-0 z-20 -mx-4 mt-auto bg-gradient-to-t from-canvas from-75% to-transparent px-4 pt-6 pb-[max(0.9rem,env(safe-area-inset-bottom))] short:pt-3 tiny:pt-2">{children}</div>;
}

/** the rule of a round; with one phone, drawing happens on a flip chart or paper */
export const ruleOf = (t: ReturnType<typeof useT>, type: RoundType, mode: Mode) => (type === "draw" && mode === "local" ? t.drawPaper : t.round[type].rule);

export function RoundCard({ v, n, mode, className = "" }: { v: View; n: number; mode: Mode; className?: string }) {
  const t = useT();
  const type = v.settings.rounds[n];
  return (
    <section className={`${panel} flex gap-4 short:gap-3 short:p-4 tiny:p-3 ${className}`}>
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-raised text-accent short:size-10 tiny:hidden">
        <RoundIcon type={type} className="size-7" />
      </span>
      <div>
        <p className="text-sm text-muted tiny:hidden">{t.roundOf(n + 1, v.settings.rounds.length)}</p>
        <h2 className="text-2xl font-extrabold tracking-tight short:text-xl">{t.round[type].name}</h2>
        <p className="mt-1 text-muted short:text-sm">{ruleOf(t, type, mode)}</p>
      </div>
    </section>
  );
}

/** sparkle button that fetches a funny name without blocking anything; spins while it waits */
export function AiNameButton({ label, make, onName, disabled, className = mini }: { label: string; make: () => Promise<string>; onName: (n: string) => void; disabled?: boolean; className?: string }) {
  const [loading, setLoading] = useState(false);
  if (!useAiOn()) return null; // AI off or not signed in: no AI features anywhere
  return (
    <button
      type="button"
      onClick={async () => {
        setLoading(true);
        try {
          onName(await make());
        } finally {
          setLoading(false);
        }
      }}
      disabled={disabled || loading}
      aria-label={label}
      aria-busy={loading}
      className={className}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
    </button>
  );
}
