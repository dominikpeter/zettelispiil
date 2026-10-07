"use client";

import { Check, Eraser } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useHints, useT } from "@/lib/prefs";
import { secondsFor } from "@/lib/settings";
import { useCountdown } from "@/lib/useCountdown";
import { Bowl, btn, btn2, buzz, fitLine, press, RoundIcon, Slip, TEAM, TimerRing } from "@/lib/ui";
import { DrawPad, DrawView, INKS } from "../DrawBoard";
import { ruleOf, type P } from "./common";
import { HeckleFx, useHeckle } from "./Heckle";

const SWIPE = 90; // px to count as a swipe

/** the slip's face: the word (one line), its hint and the two stamps at the given strength. `live`: the one being played
 * (a thrown copy is decoration: no test id, no unfolding) */
function SlipFace({ text, hint, compact, locked = false, got, skip, skipLabel, live = true }: { text: string; hint: string; compact: boolean; locked?: boolean; got: number; skip: number; skipLabel: string; live?: boolean }) {
  const t = useT();
  const showHint = useHints();
  return (
    <Slip tilt={-1.5} className={`${live ? "unfold" : ""} relative @container px-5 text-center ${compact ? "pt-6 pb-7" : "pt-10 pb-12 [@media(max-height:640px)]:pt-6 [@media(max-height:640px)]:pb-8"} ${locked ? "opacity-70 grayscale" : ""}`}>
      <p data-testid={live ? "word" : undefined} className="font-hand leading-tight font-bold" style={fitLine(text)}>
        {text}
      </p>
      {showHint && hint && <p className="mt-3 text-base text-paper-ink/60">{hint}</p>}
      {/* stamps that fade in while dragging, and show in full on a throw */}
      <span className="absolute top-3 left-4 -rotate-12 rounded-md border-2 border-stamp px-2 text-sm font-extrabold text-stamp" style={{ opacity: got }}>
        {t.stampGot}
      </span>
      <span className="absolute top-3 right-4 rotate-12 rounded-md border-2 border-paper-ink/60 px-2 text-sm font-extrabold text-paper-ink/60" style={{ opacity: skip }}>
        {skipLabel}
      </span>
    </Slip>
  );
}

function SwipeSlip({ text, hint, locked, canSkip, fling, onSwipe, heckle = null, compact = false }: { text: string; hint: string; locked: boolean; canSkip: boolean; fling: "r" | "l" | null; onSwipe: (d: "r" | "l", dx: number) => void; heckle?: { ms: number } | null; compact?: boolean }) {
  const t = useT();
  const [dx, setDx] = useState(0);
  const [shake, setShake] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);
  const done = locked || fling !== null;
  const release = () => {
    if (start.current === null) return;
    start.current = null;
    setDragging(false);
    if (dx > SWIPE) onSwipe("r", dx);
    else if (dx < -SWIPE && canSkip) onSwipe("l", dx);
    else if (dx < -SWIPE) setShake((n) => n + 1); // no skips left
    setDx(0);
  };
  return (
    <div
      data-testid="slip"
      className={`relative w-full touch-none select-none ${done ? "" : "cursor-grab active:cursor-grabbing"}`}
      onPointerDown={(e) => {
        if (done) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = e.clientX;
        setDragging(true);
      }}
      onPointerMove={(e) => start.current !== null && setDx(e.clientX - start.current)}
      onPointerUp={release}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
        setDx(0);
      }}
    >
      <div
        key={shake}
        // thrown: the flying copy (Turn) takes over, this one waits unseen for the next Zetteli
        className={`${shake ? "shake" : ""} ${fling ? "opacity-0" : ""}`}
        // turns about a point below the slip, like a card held at its bottom
        style={{ transform: `translateX(${dx}px) rotate(${dx / 14}deg)`, transformOrigin: "50% 130%", transition: dragging ? "none" : "transform 0.3s var(--ease-spring)" }}
      >
        <HeckleFx fx={heckle}>
          <SlipFace text={text} hint={hint} compact={compact} locked={locked} got={Math.max(0, Math.min(1, dx / SWIPE))} skip={Math.max(0, Math.min(1, -dx / SWIPE))} skipLabel={canSkip ? t.stampSkip : t.stampNoSkip} />
        </HeckleFx>
      </div>
      {locked && (
        <p role="alert" className="pop absolute inset-x-0 top-1/2 mx-auto w-max -translate-y-1/2 -rotate-6 rounded-xl bg-cta px-5 py-2 text-3xl font-extrabold text-cta-ink shadow-xl">{t.timeUp}</p>
      )}
    </div>
  );
}

export function Turn({ v, offset, send, live, mode }: P & { offset: number }) {
  const t = useT();
  const left = useCountdown(v, offset); // ticks here, not in the page: the header and the rest stay put
  const d = v.active!;
  const p = v.players[d];
  const me = d === v.me;
  const total = v.carryMs || secondsFor(v.settings, v.settings.rounds[v.round]) * 1000;
  const shownLeft = left === Infinity ? total : left;
  const up = left <= 0;
  const [fling, setFling] = useState<"r" | "l" | null>(null);
  const [shown, setShown] = useState(v.word?.id);
  // new Zetteli arrived: clear the fling so it unfolds fresh
  if (v.word?.id !== shown) {
    setShown(v.word?.id);
    setFling(null);
  }

  useEffect(() => {
    if (up && me) buzz([90, 60, 90]);
  }, [up, me]);

  // the thrown Zetteli flies on as a copy while the next one unfolds: the answer (instant on one phone) used to swap it
  // out before the throw could be seen
  const [thrown, setThrown] = useState<{ id: number; text: string; hint: string; dir: "r" | "l"; dx: number } | null>(null);
  const act = async (dir: "r" | "l", dx = 0) => {
    if (!v.word || up || fling) return;
    const w = v.word;
    setThrown({ id: w.id, text: w.text, hint: w.hint, dir, dx });
    setTimeout(() => setThrown((g) => (g?.id === w.id ? null : g)), 450);
    setFling(dir);
    buzz(dir === "r" ? 25 : 10);
    await send({ type: dir === "r" ? "got" : "skip", w: v.word.id }, d);
    setFling(null); // same Zetteli came back (e.g. request failed): show it again
  };

  const type = v.settings.rounds[v.round];
  const [ink, setInk] = useState(0);
  const showHint = useHints();
  // teammates may count a guess too; `seen` makes sure a word is only counted once
  const [teamBusy, setTeamBusy] = useState(false);
  const teamGot = async () => {
    setTeamBusy(true);
    buzz(25);
    await send({ type: "teamGot", seen: v.turnGot });
    setTeamBusy(false);
  };
  const teamButton = mode === "online" && !me && v.players[v.me]?.team === p.team && (
    <button onClick={teamGot} disabled={up || teamBusy || v.pausedLeft > 0} className={btn}>
      <Check className="size-5" aria-hidden /> {t.got}
    </button>
  );

  const { heckleButton, heckleToast, heckleSlip, mateToast } = useHeckle(v, left, send, mode);

  const [wipes, setWipes] = useState(0);

  const topBar = (
    <div className="sticky top-safe z-10 -mx-4 flex items-center justify-between gap-3 bg-canvas/90 px-4 py-2 backdrop-blur">
      <TimerRing left={shownLeft} total={total} size={76} label={t.secondsLeft} />
      <div className="text-center">
        <p className="text-sm text-muted">{t.thisTurn}</p>
        <p key={v.turnGot} className="bump text-3xl font-extrabold text-hi tabular-nums">
          +{v.turnGot}
        </p>
      </div>
      <Bowl count={v.bowlLeft} className="w-20" />
    </div>
  );
  const buttons = (
    <div className="grid grid-cols-turn-actions gap-3 pb-2">
      <button onClick={() => act("l")} disabled={up || !!fling || !v.canSkip} className={`${btn2} min-h-14 flex-col gap-0 leading-tight`}>
        {t.next}
        {v.settings.skips !== -1 && <span className="text-xs font-medium text-muted">{t.left(v.settings.skips - v.held.length)}</span>}
      </button>
      <button onClick={() => act("r")} disabled={up || !!fling} className={btn}>
        <Check className="size-5" aria-hidden /> {t.got}
      </button>
    </div>
  );

  const drawingOnline = type === "draw" && mode === "online";
  const heldSlips = v.held.length > 0 && (
    <div className="enter min-w-0">
      <p className="mb-1.5 text-xs text-muted">{t.setAside}</p>
      <div className={`flex gap-2 ${drawingOnline ? "overflow-x-auto py-1" : "flex-wrap"}`}>
        {v.held.map((h, i) => (
          <button
            key={h.id}
            disabled={up || !!fling}
            onClick={() => v.word && send({ type: "back", w: v.word.id, to: h.id }, d)}
            aria-label={t.swapBack(h.text)}
            className={`${press} max-w-full disabled:opacity-40 ${drawingOnline ? "shrink-0" : ""}`}
          >
            <Slip tilt={i % 2 ? 2 : -3} className="unfold px-2.5 pt-0.5 pb-0.5">
              <span className={`font-hand text-xl font-bold ${drawingOnline ? "block truncate" : "break-words"}`}>{h.text}</span>
            </Slip>
          </button>
        ))}
      </div>
    </div>
  );

  if (type === "draw" && me && mode === "online") {
    const word = v.word;
    const sheet = v.sheet;
    return (
      <div className="flex flex-1 flex-col gap-2">
        {heckleToast}
        {topBar}
        {word && (
          <HeckleFx fx={heckleSlip} className="w-full max-w-xs self-center">
            <Slip key={word.id} tilt={-1} className="unfold @container w-full px-5 pt-1.5 text-center">
              <span data-testid="word" className="font-hand block font-bold" style={fitLine(word.text, "2.25rem")}>
                {word.text}
              </span>
              {showHint && word.hint && <span className="block text-center text-sm text-paper-ink/60">{word.hint}</span>}
            </Slip>
          </HeckleFx>
        )}
        {/* the paper takes what's left of the screen, never more: no scrolling while drawing */}
        <div className="mx-auto w-full" style={{ maxWidth: v.held.length ? "min(100%, calc(100dvh - 28rem))" : "min(100%, calc(100dvh - 24rem))" }}>
          {word && sheet !== null && live && (
            <DrawPad key={word.id} code={live.code} sheet={sheet} wipeNo={wipes} ink={ink} label={t.drawHere} onFlush={up ? undefined : live.draw} />
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2" role="radiogroup" aria-label={t.drawHere}>
            {INKS.map((c, i) => (
              <button
                key={c}
                role="radio"
                aria-checked={ink === i}
                aria-label={t.pen(i + 1)}
                onClick={() => setInk(i)}
                className={`size-10 rounded-full border-4 ${press} ${ink === i ? "border-accent" : "border-surface"}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <button
            onClick={async () => {
              setWipes((n) => n + 1);
              await send({ type: "wipe" }, d);
            }}
            disabled={up}
            aria-label={t.wipe}
            className={`${btn2} w-auto! px-3`}
          >
            <Eraser className="size-5" aria-hidden />
          </button>
        </div>
        {heldSlips}
        {buttons}
      </div>
    );
  }

  if (type === "draw" && mode === "online") {
    const guessing = v.players[v.me]?.team === p.team;
    return (
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <TimerRing left={shownLeft} total={total} size={64} label={t.secondsLeft} />
          <div className="min-w-0 text-right">
            <p className={`text-3xl font-extrabold tracking-tight ${guessing ? TEAM[p.team].text : "text-ink"}`}>{guessing ? t.guess : type === "draw" ? t.watch : t.listen}</p>
            <p className="truncate text-muted">
              {t.explains(p.name, type)} · <b className="text-ink tabular-nums">{v.turnGot}</b> {t.guessed}
            </p>
          </div>
        </div>
        <div className="mx-auto w-full" style={{ maxWidth: teamButton ? "min(100%, calc(100dvh - 17rem))" : "min(100%, calc(100dvh - 12rem))" }}>
          {live && v.sheet !== null && <DrawView code={live.code} sheet={v.sheet} label={t.explains(p.name, type)} />}
        </div>
        {teamButton}
        {heckleButton}
        {mateToast}
      </div>
    );
  }

  if (!me) {
    const guessing = v.players[v.me]?.team === p.team;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="flex items-center gap-2 text-muted">
          <RoundIcon type={type} className="size-5" />
          {t.round[type].name}
        </div>
        <TimerRing left={shownLeft} total={total} size={220} label={t.secondsLeft} />
        <div>
          <p className={`text-5xl font-extrabold tracking-tight ${guessing ? TEAM[p.team].text : "text-ink"}`}>{guessing ? t.guess : type === "draw" ? t.watch : t.listen}</p>
          <p className="mt-2 text-lg text-muted">
            {t.explains(p.name, type)}
            {!guessing && `, ${t.forTeam(v.teamNames[p.team])}`}
          </p>
        </div>
        <p className="flex items-center gap-4 text-muted">
          <span>
            <b key={v.turnGot} className="bump text-2xl text-ink tabular-nums">
              {v.turnGot}
            </b>{" "}
            {t.guessed}
          </span>
          <span>
            <b className="text-2xl text-ink tabular-nums">{v.bowlLeft}</b> {t.inBowl}
          </span>
        </p>
        {teamButton && <div className="w-full">{teamButton}</div>}
        {heckleButton && <div className="w-full">{heckleButton}</div>}
        {mateToast}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      {heckleToast}
      {/* always visible: time, score this turn, bowl */}
      {topBar}
      <div className="flex items-start gap-2 rounded-2xl bg-surface px-3 py-2 text-sm text-muted">
        <RoundIcon type={type} className="mt-0.5 size-4 shrink-0 text-accent" />
        <p className="[@media(max-height:700px)]:line-clamp-2">
          <b className="text-ink">{t.round[type].name}:</b> {ruleOf(t, type, mode)}
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        {/* a set-aside Zetteli adds a row below: the slip gets slimmer and the swipe hint (known by now) goes, so the buttons
            never slide off the screen mid-turn */}
        <div className="relative w-full">
          {/* keys prefixed: the live slip and the flying copy of the same Zetteli are siblings for a moment */}
          {v.word && <SwipeSlip key={`w${v.word.id}`} text={v.word.text} hint={v.word.hint} locked={up} canSkip={v.canSkip} fling={fling} onSwipe={act} heckle={heckleSlip} compact={v.held.length > 0} />}
          {thrown && (
            <div key={`t${thrown.id}`} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10">
              <div className={thrown.dir === "r" ? "fling-r" : "fling-l"} style={{ transformOrigin: "50% 130%", "--dx": `${thrown.dx}px`, "--rot": `${thrown.dx / 14}deg` } as CSSProperties}>
                <SlipFace text={thrown.text} hint={thrown.hint} compact={v.held.length > 0} got={thrown.dir === "r" ? 1 : 0} skip={thrown.dir === "l" ? 1 : 0} skipLabel={t.stampSkip} live={false} />
              </div>
            </div>
          )}
        </div>
        {!up && !v.held.length && <p className="mt-4 text-center text-sm text-muted [@media(max-height:640px)]:hidden">{t.swipeHint}</p>}
      </div>

      {heldSlips}

      {buttons}
    </div>
  );
}
