"use client";

import { ArrowLeft, ChevronRight, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useT } from "@/lib/prefs";
import { ONLINE_DEFAULT_ROUNDS } from "@/lib/settings";
import { Bowl, btn, Confetti, ghost, RoundIcon, scrollBehavior, Slip, TimerRing } from "@/lib/ui";

// "So geht's": the game in seven scenes. The bowl stays pinned while the chapters scroll past underneath it; the chapter
// in view sets the scene (players, slips, timer, rounds), and each scene plays its little loop. Plain React state and CSS
// transitions, no scroll-timeline, so it works in every browser the app runs in (iOS 15 included)

const PLAYERS = [
  { name: "Lisa", team: 0 },
  { name: "Nora", team: 1 },
  { name: "Tim", team: 0 },
  { name: "Beni", team: 1 },
];
const WORDS = ["Matterhorn", "Rösti", "Velo", "Fondue"];
// the scene's tint per chapter (theme tokens only)
const TINT = ["bg-raised", "bg-team-a/10", "bg-gold/15", "bg-team-a/10", "bg-team-b/10", "bg-accent/10", "bg-gold/20"];

/** where a player stands (in the stage's own units): around the bowl first, then with their team */
function spot(i: number, step: number) {
  if (step === 0) return { x: [-33, -11, 11, 33][i], y: -6 };
  const p = PLAYERS[i];
  const row = i < 2 ? 0 : 1;
  // teams in the top corners while the slips are written, lower at the sides once the bowl is in play
  return { x: p.team === 0 ? -37 : 37, y: step >= 3 ? 14 + row * 11 : -30 + row * 11 };
}

export default function Guide() {
  const t = useT();
  const g = t.guide;
  const n = g.steps.length;
  const [step, setStep] = useState(0);
  const sections = useRef<(HTMLElement | null)[]>([]);
  const pinned = useRef<HTMLDivElement>(null);

  // on stage: the last chapter whose heading has come up past a line a little below the pinned scene (a third of the
  // way into the space left under it), so the scene always matches the words being read. Measured once per frame
  useEffect(() => {
    let raf = 0;
    const pick = () => {
      const top = pinned.current?.getBoundingClientRect().bottom ?? 0;
      const line = top + (innerHeight - top) / 3;
      let i = 0;
      sections.current.forEach((s, k) => {
        if (s && s.getBoundingClientRect().top <= line) i = k;
      });
      setStep(i);
    };
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(pick);
    };
    later();
    addEventListener("scroll", later, { passive: true });
    addEventListener("resize", later);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", later);
      removeEventListener("resize", later);
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pt-3">
      <header className="flex min-h-[calc(2.75rem+2px)] items-center">
        <Link href="/" className={`${ghost} -ml-3 inline-flex items-center gap-1.5`}>
          <ArrowLeft className="size-5" aria-hidden /> {t.back}
        </Link>
      </header>
      <h1 className="text-4xl font-extrabold tracking-tight">{t.howTo}</h1>
      <p className="mt-2 text-lg text-muted">{g.intro}</p>

      {/* the pinned scene; everything in it is decoration, the chapters below carry the words */}
      {/* solid, so the chapters scroll away underneath instead of showing through; a short fade below it */}
      <div ref={pinned} className="sticky top-0 z-10 -mx-4 mt-4 bg-canvas px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <Stage step={step} />
        <nav aria-label={t.howTo} className="mt-2 flex items-center justify-center gap-1.5">
          {g.steps.map((s, i) => (
            <button
              key={i}
              type="button"
              aria-label={s.h}
              aria-current={i === step ? "step" : undefined}
              onClick={() => sections.current[i]?.scrollIntoView({ block: "center", behavior: scrollBehavior() })}
              className="grid size-7 place-items-center"
            >
              <span className={`block h-2 rounded-full transition-[width,background-color] duration-300 ${i === step ? "w-6 bg-accent" : "w-2 bg-line"}`} />
            </button>
          ))}
        </nav>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full h-6 bg-gradient-to-b from-canvas to-transparent" />
      </div>

      {g.steps.map((s, i) => (
        <section
          key={i}
          ref={(el) => {
            sections.current[i] = el;
          }}
          data-i={i}
          className={`flex min-h-[36svh] flex-col pt-4 pb-6 transition-opacity duration-300 ${i === step ? "opacity-100" : "opacity-40"}`}
        >
          <p className="text-sm font-semibold text-accent tabular-nums">{g.step(i + 1, n)}</p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-tight">{s.h}</h2>
          <p className="mt-2 text-lg leading-relaxed text-muted">{s.p}</p>
        </section>
      ))}

      <div className="pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <Link href="/" className={btn}>
          {g.go} <ChevronRight className="size-5" aria-hidden />
        </Link>
      </div>
    </main>
  );
}

/** the scene: a square stage with the bowl at its heart; positions in container units, so it scales with the phone */
function Stage({ step }: { step: number }) {
  const t = useT();
  return (
    <div aria-hidden className={`relative aspect-[4/3] overflow-hidden rounded-4xl ${TINT[step]} transition-colors duration-500 [container-type:size]`}>
      {PLAYERS.map((p, i) => {
        const { x, y } = spot(i, step);
        const team = step > 0 ? (p.team === 0 ? "bg-team-a text-white" : "bg-team-b text-white") : "bg-surface text-ink";
        return (
          <span
            key={p.name}
            className={`absolute top-1/2 left-1/2 rounded-full px-3 py-1 text-sm font-bold shadow-sm transition-[translate,scale,background-color,color] duration-500 ease-spring ${team}`}
            style={{ translate: `calc(-50% + ${x}cqw) calc(-50% + ${y}cqh)`, scale: step >= 3 ? "0.85" : "1", transitionDelay: `${i * 60}ms` } as CSSProperties}
          >
            {p.name}
          </span>
        );
      })}

      {/* writing: four slips pop up in a row, then drop into the bowl one after the other */}
      {step === 2 &&
        WORDS.map((w, i) => (
          <span
            key={w}
            className="guide-write absolute top-1/2 left-1/2"
            style={{ "--x": `${[-30, -10, 10, 30][i]}cqw`, animationDelay: `${i * 0.18}s` } as CSSProperties}
          >
            <Slip tilt={[-6, 4, -3, 7][i]} className="px-2 pt-1 pb-2">
              <span className="font-hand text-base font-bold whitespace-nowrap">{w}</span>
            </Slip>
          </span>
        ))}

      {/* explaining and passing: a slip comes out of the bowl and flies off to the right (guessed) or left (passed) */}
      {(step === 3 || step === 4) && <Turn key={`turn-${step}`} dir={step === 3 ? "right" : "left"} word={step === 3 ? WORDS[0] : WORDS[1]} label={step === 3 ? t.got : t.next} />}

      {step === 5 && <Rounds />}

      {step === 6 && (
        <>
          <Confetti n={40} />
          <div className="guide-pop absolute inset-x-0 top-[14%] flex flex-col items-center gap-1">
            <Trophy className="size-12 text-gold" aria-hidden />
            <p className="text-6xl font-extrabold tabular-nums">
              <span className="text-team-a">12</span>
              <span className="mx-2 text-muted">:</span>
              <span className="text-team-b">9</span>
            </p>
          </div>
        </>
      )}

      <StageBowl key={`bowl-${step}`} step={step} />
    </div>
  );
}

/** the bowl: empty until the slips are written, then it holds them (one is out while a turn is on). Remounted with
 *  every chapter, so the writing chapter always starts empty and fills when its slips have dropped in */
function StageBowl({ step }: { step: number }) {
  const [landed, setLanded] = useState(step > 2);
  useEffect(() => {
    if (step !== 2) return;
    const id = setTimeout(() => setLanded(true), 2300);
    return () => clearTimeout(id);
  }, [step]);
  const count = !landed ? 0 : step === 3 || step === 4 ? 3 : 4;
  return <Bowl count={count} className={`absolute bottom-[6%] left-1/2 w-[46cqw] -translate-x-1/2 ${step === 6 ? "translate-y-[4cqh]" : ""}`} />;
}

/** one turn in a loop: the slip unfolds out of the bowl, the clock runs, then a swipe sends it off */
function Turn({ dir, word, label }: { dir: "right" | "left"; word: string; label: string }) {
  const t = useT();
  const [left, setLeft] = useState(30_000);
  const [score, setScore] = useState(0);
  useEffect(() => {
    const tick = setInterval(() => setLeft((l) => (l <= 1000 ? 30_000 : l - 1000)), 1000);
    const point = dir === "right" ? setInterval(() => setScore((s) => s + 1), 3200) : undefined;
    return () => (clearInterval(tick), clearInterval(point));
  }, [dir]);
  return (
    <>
      <div className="absolute top-[5%] right-[5%]">
        <TimerRing left={left} total={30_000} size={56} label={t.secondsLeft} />
      </div>
      {dir === "right" && (
        <span key={score} className="bump absolute top-[7%] left-[6%] rounded-full bg-team-a px-3 py-1 text-lg font-extrabold text-white tabular-nums">
          +{score + 1}
        </span>
      )}
      <div className={`guide-swipe-${dir} absolute top-[30%] left-1/2`}>
        <Slip tilt={dir === "right" ? -2 : 2} className="px-5 pt-2 pb-3">
          <span className="font-hand text-4xl font-bold whitespace-nowrap">{word}</span>
        </Slip>
        {/* above the slip, in the middle: the sides belong to the teams */}
        <span className={`guide-label absolute bottom-full left-0 mb-2 w-full text-center`}>
          <span className={`rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap ${dir === "right" ? "bg-accent text-canvas" : "bg-surface text-ink"}`}>
            {dir === "right" ? `${label} →` : `← ${label}`}
          </span>
        </span>
      </div>
    </>
  );
}

/** the five rounds, one after the other: the same slips, stricter rules */
function Rounds() {
  const t = useT();
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % ONLINE_DEFAULT_ROUNDS.length), 1200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="absolute inset-x-0 top-[12%] flex flex-col items-center gap-3">
      <div className="flex gap-2">
        {ONLINE_DEFAULT_ROUNDS.map((r, k) => (
          <span key={r} className={`grid size-12 place-items-center rounded-2xl transition-[scale,background-color,color] duration-300 ${k === i ? "scale-110 bg-accent text-canvas" : "bg-surface text-muted"}`}>
            <RoundIcon type={r} className="size-6" />
          </span>
        ))}
      </div>
      <p key={i} className="guide-pop text-2xl font-extrabold tracking-tight">
        {t.round[ONLINE_DEFAULT_ROUNDS[i]].name}
      </p>
    </div>
  );
}
