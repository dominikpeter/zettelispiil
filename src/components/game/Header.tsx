"use client";

import { ArrowLeft, Home, Pause, Play, ChevronDown, Settings2, X } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/prefs";
import { type View } from "@/lib/room";
import { btn, btn2, ghost, pill, pillBtn, TEAM } from "@/lib/ui";
import { SettingsPanel } from "../TopControls";
import { Confirm, Modal, Waiting, type Mode, type Send } from "./common";

export function Score({ v }: { v: View }) {
  const tot = v.teamNames.map((_, t) => v.scores.reduce((s, r) => s + (r[t] ?? 0), 0));
  const label = v.teamNames.map((n, t) => `${n} ${tot[t]}`).join(", ");
  if (tot.length === 2)
    return (
      <div className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-lg font-bold tabular-nums" role="img" aria-label={label}>
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
    <div className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-lg font-bold tabular-nums max-xs:gap-1.5 max-xs:px-2.5 max-xs:text-base" role="img" aria-label={label}>
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

/**
 * back arrow for the header: straight home outside a game, after a confirm inside one. Before the first turn, whoever may
 * (host, or anyone on one phone: `onSettings`) goes back one step instead: to the settings, nothing written is lost
 */
export function BackButton({ v, onLeave, onSettings, label, local = false }: { v: View | null; onLeave: () => void; onSettings?: () => void; label?: string; local?: boolean }) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const safe = !v || v.me < 0 || v.phase === "lobby" || v.phase === "end";
  const toSettings = !!v?.beforePlay && !!onSettings;
  return (
    <>
      <button
        onClick={() => (safe ? onLeave() : toSettings ? onSettings!() : setAsking(true))}
        aria-label={toSettings ? t.backToSettings : t.back}
        className={`${ghost} -ml-3 flex items-center gap-1.5`}
      >
        <ArrowLeft className="size-5" aria-hidden />
        {label && (
          <span translate="no" className="font-bold tracking-[0.2em] text-ink">
            {label}
          </span>
        )}
      </button>
      {asking && <Confirm text={local ? t.leaveConfirmLocal : t.leaveConfirm} yes={t.leaveGame} no={t.resumeTurn} onYes={onLeave} onNo={() => setAsking(false)} />}
    </>
  );
}

/** pause button + pause screen: stops the turn clock for everyone; the host can cancel the game from here */
export function GameMenu({ v, send, mode, onLeave }: { v: View; send: Send; mode: Mode; onLeave: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
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
    setAsking(false);
    setOpen(false);
    await send({ type: "cancel" }, 0);
  };
  const toSettings = async () => {
    setOpen(false);
    await send({ type: "toSettings" }, 0);
  };

  return (
    <>
      <div className={pill}>
        <button onClick={pause} aria-label={t.pause} className={pillBtn}>
          <Pause className="size-[1.15rem]" strokeWidth={2.25} aria-hidden />
        </button>
      </div>
      {(open || paused) && (
        <Modal
          label={t.paused}
          onCancel={() => (!paused || canPause) && resume()} // Escape: back to the game, where this phone may resume it
          className="enter m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto overscroll-contain bg-canvas p-0 text-ink"
        >
          <div className="flex min-h-full flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
              <span className="pop grid size-24 place-items-center rounded-4xl bg-raised text-accent">
                <Pause className="size-12" strokeWidth={1.75} aria-hidden />
              </span>
              <h2 className="mt-2 text-5xl font-extrabold tracking-tight">{t.paused}</h2>
              {paused && <p className="max-w-[30ch] text-muted">{canPause ? t.pausedTurn : t.pausedBy}</p>}
              {turn && !paused && !canPause && <p className="max-w-[30ch] text-muted">{t.menuRunning}</p>}
            </div>
            <details className="mx-auto mb-4 w-full max-w-md rounded-3xl bg-surface p-4 [&[open]>summary>svg]:rotate-180">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-semibold [&::-webkit-details-marker]:hidden">
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
              {canCancel && v.beforePlay && (
                <button onClick={toSettings} className={`${btn2} flex-col gap-0 py-2`}>
                  <span className="flex items-center gap-2">
                    <Settings2 className="size-5" aria-hidden /> {t.backToSettings}
                  </span>
                  <span className="text-sm font-normal text-muted">{t.backToSettingsNote}</span>
                </button>
              )}
              {canCancel && (
                <button onClick={() => setAsking(true)} className={`${btn2} flex-col gap-0 py-2`}>
                  <span className="flex items-center gap-2">
                    <X className="size-5" aria-hidden /> {t.cancelGame}
                  </span>
                  <span className="text-sm font-normal text-muted">{t.cancelNote}</span>
                </button>
              )}
              <button onClick={onLeave} className={`${ghost} flex w-full flex-col items-center justify-center gap-0 py-1`}>
                <span className="flex items-center gap-2">
                  <Home className="size-4" aria-hidden /> {t.leaveGame}
                </span>
                <span className="text-sm font-normal">{local ? t.leaveNoteLocal : t.leaveNote}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
      {asking && <Confirm text={t.cancelConfirm} yes={t.cancelGame} no={t.resumeTurn} onYes={cancel} onNo={() => setAsking(false)} />}
    </>
  );
}
