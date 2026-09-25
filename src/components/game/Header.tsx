"use client";

import { ArrowLeft, Home, Pause, Play, ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/prefs";
import { type View } from "@/lib/room";
import { btn, btn2, ghost, pill, pillBtn, TEAM } from "@/lib/ui";
import { SettingsPanel } from "../TopControls";
import { Waiting, type Mode, type Send } from "./common";

export function Score({ v }: { v: View }) {
  const tot = v.teamNames.map((_, t) => v.scores.reduce((s, r) => s + (r[t] ?? 0), 0));
  const label = v.teamNames.map((n, t) => `${n} ${tot[t]}`).join(", ");
  if (tot.length === 2)
    return (
      <div className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-lg font-bold tabular-nums" aria-label={label}>
        <span className="size-2.5 rounded-full bg-team-a" />
        <span key={`a${tot[0]}`} className="bump text-team-a">
          {tot[0]}
        </span>
        <span className="text-muted">:</span>
        <span key={`b${tot[1]}`} className="bump text-team-b">
          {tot[1]}
        </span>
        <span className="size-2.5 rounded-full bg-team-b" />
      </div>
    );
  // three or more teams: a dot and a number each, tight enough for the smallest phones
  return (
    <div className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-lg font-bold tabular-nums max-xs:gap-1.5 max-xs:px-2.5 max-xs:text-base" aria-label={label}>
      {tot.map((n, t) => (
        <span key={t} className="flex items-center gap-1">
          <span className={`size-2.5 rounded-full ${TEAM[t].bg}`} />
          <span key={`${t}-${n}`} className={`bump ${TEAM[t].text}`}>
            {n}
          </span>
        </span>
      ))}
    </div>
  );
}

/** back arrow for the header: straight home outside a game, after a confirm inside one */
export function BackButton({ v, onLeave, label }: { v: View | null; onLeave: () => void; label?: string }) {
  const t = useT();
  const safe = !v || v.me < 0 || v.phase === "lobby" || v.phase === "end";
  return (
    <button onClick={() => (safe || confirm(t.leaveConfirm)) && onLeave()} aria-label={t.back} className={`${ghost} -ml-3 flex items-center gap-1.5`}>
      <ArrowLeft className="size-5" aria-hidden />
      {label && (
        <span translate="no" className="font-bold tracking-[0.2em] text-ink">
          {label}
        </span>
      )}
    </button>
  );
}

/** pause button + pause screen: stops the turn clock for everyone; the host can cancel the game from here */
export function GameMenu({ v, send, mode, onLeave }: { v: View; send: Send; mode: Mode; onLeave: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const local = mode === "local";
  const turn = v.phase === "turn";
  const paused = turn && v.pausedLeft > 0;
  const canPause = local || v.isHost || (turn && v.me === v.active);
  const canCancel = local || v.isHost;
  if (v.phase === "lobby" || v.phase === "end" || v.me < 0) return null;

  const pause = async () => {
    setOpen(true);
    if (turn && canPause && !paused) await send({ type: "pause" });
  };
  const resume = async () => {
    setOpen(false);
    if (paused) await send({ type: "resume" });
  };
  const cancel = async () => {
    if (!confirm(t.cancelConfirm)) return;
    setOpen(false);
    await send({ type: "cancel" }, 0);
  };

  return (
    <>
      <div className={pill}>
        <button onClick={pause} aria-label={t.pause} className={pillBtn}>
          <Pause className="size-[1.15rem]" strokeWidth={2.25} aria-hidden />
        </button>
      </div>
      {(open || paused) && (
        <div role="dialog" aria-modal="true" aria-label={t.paused} className="enter fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-canvas/95 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
            <span className="pop grid size-24 place-items-center rounded-4xl bg-raised text-accent">
              <Pause className="size-12" strokeWidth={1.75} aria-hidden />
            </span>
            <h2 className="mt-2 text-5xl font-extrabold tracking-tight">{t.paused}</h2>
            {paused && <p className="max-w-[30ch] text-muted">{canPause ? t.pausedTurn : t.pausedBy}</p>}
            {turn && !paused && !canPause && <p className="max-w-[30ch] text-muted">{t.menuRunning}</p>}
          </div>
          <details className="mx-auto mb-4 w-full max-w-md rounded-3xl bg-surface p-4 [&[open]>summary>svg]:rotate-180">
            <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
              {t.settings}
              <ChevronDown className="size-5 transition-transform" aria-hidden />
            </summary>
            <div className="mt-4 flex flex-col gap-5">
              <SettingsPanel />
            </div>
          </details>
          <div className="mx-auto flex w-full max-w-md flex-col gap-2">
            {(!paused || canPause) && (
              <button onClick={resume} className={btn}>
                <Play className="size-5" aria-hidden /> {t.resumeTurn}
              </button>
            )}
            {!canPause && paused && <Waiting text={t.pausedBy} />}
            {canCancel && (
              <button onClick={cancel} className={btn2}>
                <X className="size-5" aria-hidden /> {t.cancelGame}
              </button>
            )}
            <button onClick={onLeave} className={`${ghost} flex w-full items-center justify-center gap-2`}>
              <Home className="size-4" aria-hidden /> {t.leaveGame}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
