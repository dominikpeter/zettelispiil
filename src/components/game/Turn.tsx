"use client";

import { Check, Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHints, useT } from "@/lib/prefs";
import { useCountdown } from "@/lib/useCountdown";
import { Bowl, btn, btn2, buzz, fitLine, press, RoundIcon, Slip, TEAM, TimerRing } from "@/lib/ui";
import { DrawPad, DrawView, INKS } from "../DrawBoard";
import { ruleOf, type P } from "./common";
import { HeckleFx, useHeckle } from "./Heckle";

const SWIPE = 90; // px to count as a swipe

function SwipeSlip({ text, hint, locked, canSkip, fling, onSwipe, heckle = null }: { text: string; hint: string; locked: boolean; canSkip: boolean; fling: "r" | "l" | null; onSwipe: (d: "r" | "l") => void; heckle?: { ms: number } | null }) {
  const t = useT();
  const showHint = useHints();
  const [dx, setDx] = useState(0);
  const [shake, setShake] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);
  const done = locked || fling !== null;
  const release = () => {
    if (start.current === null) return;
    start.current = null;
    setDragging(false);
    if (dx > SWIPE) onSwipe("r");
    else if (dx < -SWIPE && canSkip) onSwipe("l");
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
        className={fling === "r" ? "fling-r" : fling === "l" ? "fling-l" : shake ? "shake" : ""}
        style={{ transform: `translateX(${dx}px) rotate(${dx / 14}deg)`, transition: dragging ? "none" : "transform 0.3s var(--ease-spring)" }}
      >
        <HeckleFx fx={heckle}>
          <Slip tilt={-1.5} className={`unfold relative @container px-5 pt-10 pb-12 text-center [@media(max-height:640px)]:pt-6 [@media(max-height:640px)]:pb-8 ${locked ? "opacity-70 grayscale" : ""}`}>
            <p data-testid="word" className="font-hand leading-tight font-bold" style={fitLine(text)}>
              {text}
            </p>
            {showHint && hint && <p className="mt-3 text-base text-paper-ink/60">{hint}</p>}
            {/* stamps that fade in while dragging */}
            <span className="absolute top-3 left-4 -rotate-12 rounded-md border-2 border-stamp px-2 text-sm font-extrabold text-stamp" style={{ opacity: Math.max(0, Math.min(1, dx / SWIPE)) }}>
              {t.stampGot}
            </span>
            <span className="absolute top-3 right-4 rotate-12 rounded-md border-2 border-paper-ink/60 px-2 text-sm font-extrabold text-paper-ink/60" style={{ opacity: Math.max(0, Math.min(1, -dx / SWIPE)) }}>
              {canSkip ? t.stampSkip : t.stampNoSkip}
            </span>
          </Slip>
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
  const total = v.carryMs || v.settings.seconds * 1000;
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

  const act = async (dir: "r" | "l") => {
    if (!v.word || up || fling) return;
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
    <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 bg-canvas/90 px-4 py-2 backdrop-blur">
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
    <div className="grid grid-cols-[1fr_1.6fr] gap-3 pb-2">
      <button onClick={() => act("l")} disabled={up || !!fling || !v.canSkip} className={`${btn2} min-h-14 flex-col gap-0 leading-tight`}>
        {t.next}
        {v.settings.skips !== -1 && <span className="text-xs font-medium text-muted">{t.left(v.settings.skips - v.held.length)}</span>}
      </button>
      <button onClick={() => act("r")} disabled={up || !!fling} className={btn}>
        <Check className="size-5" aria-hidden /> {t.got}
      </button>
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
        <div className="mx-auto w-full" style={{ maxWidth: "min(100%, calc(100dvh - 24rem))" }}>
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
            <p className={`text-3xl font-extrabold tracking-tight ${guessing ? TEAM[p.team].text : "text-ink"}`}>{guessing ? t.guess : t.listen}</p>
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
          <p className={`text-5xl font-extrabold tracking-tight ${guessing ? TEAM[p.team].text : "text-ink"}`}>{guessing ? t.guess : t.listen}</p>
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
        {v.word && <SwipeSlip key={v.word.id} text={v.word.text} hint={v.word.hint} locked={up} canSkip={v.canSkip} fling={fling} onSwipe={act} heckle={heckleSlip} />}
        {!up && <p className="mt-4 text-center text-sm text-muted [@media(max-height:640px)]:hidden">{t.swipeHint}</p>}
      </div>

      {v.held.length > 0 && (
        <div className="enter">
          <p className="mb-2 text-sm text-muted">{t.setAside}</p>
          <div className="flex flex-wrap gap-3">
            {v.held.map((h, i) => (
              <button
                key={h.id}
                disabled={up || !!fling}
                onClick={() => v.word && send({ type: "back", w: v.word.id, to: h.id }, d)}
                aria-label={t.swapBack(h.text)}
                className={`${press} disabled:opacity-50`}
              >
                <Slip tilt={i % 2 ? 2 : -3} className="unfold px-3 pt-1 pb-1">
                  <span className="font-hand text-2xl font-bold">{h.text}</span>
                </Slip>
              </button>
            ))}
          </div>
        </div>
      )}

      {buttons}
    </div>
  );
}
