"use client";

import { Megaphone } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useT } from "@/lib/prefs";
import { type View } from "@/lib/room";
import { btn2, buzz } from "@/lib/ui";
import { type Mode, type Send } from "./common";

/** the describer's Zetteli while someone heckles: jitter, blur and a flash, strong first, easing out. Only the Zetteli, never the buttons */
export function HeckleFx({ fx, className = "", children }: { fx: { ms: number } | null; className?: string; children: ReactNode }) {
  return (
    <div data-heckled={fx ? "" : undefined} className={`${fx ? "heckle-fx" : ""} ${className}`} style={fx ? { animationDuration: `${Math.round(fx.ms)}ms` } : undefined}>
      {children}
    </div>
  );
}

/**
 * heckling during a turn (several phones): the other teams' button, and what a heckle shows: the describer's toast and
 * disturbed Zetteli, a toast for the heckler's teammates
 */
export function useHeckle(v: View, left: number, send: Send, mode: Mode) {
  const t = useT();
  const me = v.active === v.me;
  const p = v.players[v.active!];
  const up = left <= 0;
  // heckling: the other teams press a button, the describer's Zetteli jitters, blurs and flashes for a moment.
  // The server says until when (its clock); the turn timer gives us that clock: server now = endsAt - left
  const h = v.lastHeckle;
  const heckleRuns = !!h && left !== Infinity && h.until - (v.endsAt - left) > 0;
  const [heckleBusy, setHeckleBusy] = useState(false);
  const heckle = async () => {
    setHeckleBusy(true);
    buzz(15);
    await send({ type: "heckle" });
    setHeckleBusy(false);
  };
  const auto = v.settings.heckleMode === "auto";
  const heckleButton = mode === "online" && !me && v.settings.heckle && v.players[v.me]?.team !== p.team && (!auto || v.heckleGranted > 0) && ( // auto: only a team that got a bonus this turn
    <button onClick={heckle} disabled={up || heckleBusy || v.pausedLeft > 0 || v.heckles <= 0 || v.heckleDone || heckleRuns} className={`${btn2} min-h-14 flex-col gap-0 leading-tight`}>
      <span className="flex items-center gap-2">
        <Megaphone className="size-5" aria-hidden /> {auto ? t.heckleBonus : t.heckle}
      </span>
      <span className="text-xs font-medium text-muted">{v.heckleDone ? t.heckleDone : t.heckleLeft(v.heckles)}</span>
    </button>
  );
  // the describer's side: a new heckle starts the effect for the time it has left
  const [heckleSeen, setHeckleSeen] = useState(0);
  const [heckleFx, setHeckleFx] = useState<{ n: number; by: number; ms: number } | null>(null);
  if (h && h.n !== heckleSeen && left !== Infinity) {
    setHeckleSeen(h.n);
    const ms = h.until - (v.endsAt - left);
    if (me && mode === "online" && ms > 0) setHeckleFx({ n: h.n, by: h.by, ms });
  }
  useEffect(() => {
    if (heckleFx) buzz([60, 40, 60]);
  }, [heckleFx]);
  const fx = heckleFx && heckleRuns && h?.n === heckleFx.n ? heckleFx : null;
  const heckleToast = fx && (
    <div role="status" data-testid="heckled" className="pointer-events-none fixed inset-x-0 top-1/4 z-40 flex justify-center px-4">
      <p key={fx.n} className="pop flex max-w-full items-center gap-2 rounded-full bg-ink px-4 py-2 font-bold text-canvas shadow-xl">
        <Megaphone className="size-5 shrink-0" aria-hidden />
        <span className="truncate">{t.heckled(v.players[fx.by]?.name ?? "?")}</span>
      </p>
    </div>
  );
  const heckleSlip = fx ? { ms: fx.ms } : null;
  // the heckler's teammates see who used the (shared) bonus or pressed
  const [mateHeckle, setMateHeckle] = useState<{ n: number; by: number } | null>(null);
  const [mateSeen, setMateSeen] = useState(h?.n ?? 0);
  if (h && h.n !== mateSeen) {
    setMateSeen(h.n);
    if (mode === "online" && !me && h.by !== v.me && v.players[h.by]?.team === v.players[v.me]?.team) setMateHeckle({ n: h.n, by: h.by });
  }
  useEffect(() => {
    if (!mateHeckle) return;
    const id = setTimeout(() => setMateHeckle(null), 2200);
    return () => clearTimeout(id);
  }, [mateHeckle]);
  const mateToast = mateHeckle && (
    <div role="status" data-testid="heckled-mate" className="pointer-events-none fixed inset-x-0 top-1/4 z-40 flex justify-center px-4">
      <p key={mateHeckle.n} className="pop flex max-w-full items-center gap-2 rounded-full bg-surface px-4 py-2 font-bold text-ink shadow-xl">
        <Megaphone className="size-5 shrink-0 text-accent" aria-hidden />
        <span className="truncate">{t.heckledByMate(v.players[mateHeckle.by]?.name ?? "?")}</span>
      </p>
    </div>
  );
  return { heckleButton, heckleToast, heckleSlip, mateToast };
}
