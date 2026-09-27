"use client";

import { ArrowLeft, Brush, ChevronRight, MessageCircle, PenLine, Repeat, Shuffle, SkipForward, SlidersHorizontal, Smartphone, Trophy, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useT } from "@/lib/prefs";
import { ONLINE_DEFAULT_ROUNDS, ROUND_TYPES } from "@/lib/settings";
import { Bowl, btn, Confetti, ghost, RoundIcon, scrollBehavior, Slip, TimerRing } from "@/lib/ui";

// "So geht's": the game in nine scenes. The bowl stays pinned while the chapters scroll past underneath it; the chapter
// in view sets the scene (players, slips, timer, rounds), and each scene plays its little loop. Plain React state and CSS
// transitions, no scroll-timeline, so it works in every browser the app runs in (iOS 15 included)

const PLAYERS = [
  { name: "Lisa", team: 0 },
  { name: "Nora", team: 1 },
  { name: "Tim", team: 0 },
  { name: "Nelly", team: 1 },
];
const WORDS = ["Matterhorn", "Rösti", "Velo", "Fondue"];
// one scene per chapter, in the order of `guide.steps` in i18n.ts
const SCENES = ["table", "teams", "setup", "write", "explain", "pass", "heckle", "rounds", "draw", "win"] as const;
const at = (id: (typeof SCENES)[number]) => SCENES.indexOf(id);
// the step bar's icon per chapter
const ICONS = [Users, Shuffle, SlidersHorizontal, PenLine, MessageCircle, SkipForward, Zap, Repeat, Brush, Trophy];
// the scene's tint per chapter (theme tokens only)
const TINT = ["bg-raised", "bg-team-a/10", "bg-team-b/10", "bg-gold/15", "bg-team-a/10", "bg-team-b/10", "bg-team-b/15", "bg-accent/10", "bg-accent/15", "bg-gold/20"];
const TEAM_BG = ["bg-team-a", "bg-team-b", "bg-team-c", "bg-team-d"];
// the scene is drawn at one size and scaled to fit, so slips and names grow with it
const STAGE_W = 300;
const STAGE_H = 285;

/** where a player stands (in the stage's own units): around the bowl first, then with their team */
function spot(i: number, step: number) {
  if (step === 0) return { x: [-33, -11, 11, 33][i], y: -6 };
  const p = PLAYERS[i];
  const row = i < 2 ? 0 : 1;
  // teams in the top corners (room for their mats) while the slips are written, lower at the sides once the bowl is in play
  const side = p.team === 0 ? -1 : 1;
  return step >= at("explain") ? { x: side * 37, y: 14 + row * 12 } : { x: side * 30, y: -31 + row * 14 };
}

// each swipe lands on a chapter, and a hard flick can't skip one
const snap = (on: boolean) => (document.documentElement.style.scrollSnapType = on ? "y mandatory" : "");

export default function Guide() {
  const t = useT();
  const g = t.guide;
  const n = g.steps.length;
  const [step, setStep] = useState(0);
  const sections = useRef<(HTMLElement | null)[]>([]);
  const pinned = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [pad, setPad] = useState(0);
  const [zoom, setZoom] = useState(1);
  // just enough room below the last chapter for it to come up under the scene, and not a pixel more
  const [tail, setTail] = useState(0);

  useEffect(() => {
    snap(true);
    return () => void snap(false);
  }, []);
  // chapters snap to just under the pinned scene (scroll-padding: WebKit misplaces scroll-margin here)
  useEffect(() => {
    const html = document.documentElement;
    html.style.scrollPaddingTop = `${pad + 8}px`;
    return () => void (html.style.scrollPaddingTop = "");
  }, [pad]);

  // a tap on the step bar goes straight there: no stop at every chapter on the way. Snapping itself stays on (switching
  // it off and on leaves WebKit stuck on the chapter it lands on)
  const [jumping, setJumping] = useState(false);
  const jump = (i: number) => {
    const c = sections.current[i];
    if (!c) return;
    const top = Math.min(scrollY + c.getBoundingClientRect().top - pad - 8, document.documentElement.scrollHeight - innerHeight);
    setJumping(true);
    scrollTo({ top, behavior: scrollBehavior() });
    let frames = 0; // give up after about 1.5 s, in case the scroll is stopped on the way
    const arrive = () => (Math.abs(scrollY - top) < 2 || ++frames > 90 ? setJumping(false) : requestAnimationFrame(arrive));
    arrive();
  };

  // on stage: the last chapter whose heading has come up past a line a little below the pinned scene (a quarter of the
  // way into the space left under it), so the scene always matches the words being read. Measured once per frame
  useEffect(() => {
    let raf = 0;
    const pick = () => {
      const top = pinned.current?.getBoundingClientRect().bottom ?? 0;
      const line = top + (innerHeight - top) / 4;
      let i = 0;
      sections.current.forEach((s, k) => {
        if (s && s.getBoundingClientRect().top <= line) i = k;
      });
      setStep(i);
      const h = pinned.current?.offsetHeight ?? 0;
      setPad(h);
      // the scene as big as fits: nearly edge to edge, up to 58% of the screen's height
      setZoom(Math.min(((pinned.current?.clientWidth ?? STAGE_W + 16) - 16) / STAGE_W, (innerHeight * 0.58) / STAGE_H));
      const last = sections.current[n - 1];
      if (last && end.current) setTail(Math.max(0, innerHeight - h - 8 - last.offsetHeight - end.current.offsetHeight));
    };
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(pick);
    };
    later();
    addEventListener("scroll", later, { passive: true });
    addEventListener("resize", later);
    // the scaled scene changes the pinned height, and with it where every chapter snaps
    const ro = new ResizeObserver(later);
    if (pinned.current) ro.observe(pinned.current);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      removeEventListener("scroll", later);
      removeEventListener("resize", later);
    };
  }, [n]);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pt-3">
      {/* the top of the page is a snap point too; the margin cancels the scroll padding, which would put it above the page
          and throw WebKit's snapping off (a swipe from the first chapter went nowhere) */}
      <header className="flex min-h-[calc(2.75rem+2px)] snap-start items-center" style={{ scrollMarginTop: -(pad + 8) }}>
        <Link href="/" className={`${ghost} -ml-3 inline-flex items-center gap-1.5`}>
          <ArrowLeft className="size-5" aria-hidden /> {t.back}
        </Link>
      </header>
      <h1 className="text-4xl font-extrabold tracking-tight">{t.howTo}</h1>
      <p className="mt-2 text-lg text-muted">{g.intro}</p>

      {/* the pinned step bar and scene; the scene is decoration, the chapters below carry the words */}
      {/* solid, so the chapters scroll away underneath instead of showing through; a short fade below it */}
      <div ref={pinned} className="sticky top-0 z-10 -mx-4 mt-4 mb-2 bg-canvas px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <nav aria-label={t.howTo} className="mb-2 flex justify-between px-2">
          {g.steps.map((s, i) => {
            const Icon = ICONS[i];
            return (
              <button
                key={i}
                type="button"
                aria-label={s.h}
                aria-current={i === step ? "step" : undefined}
                onClick={() => jump(i)}
                className={`grid size-8 place-items-center rounded-full transition-colors duration-300 ${
                  i === step ? "bg-accent text-canvas" : i < step ? "bg-accent/15 text-accent" : "bg-surface text-muted"
                }`}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            );
          })}
        </nav>
        <Stage step={step} zoom={zoom} />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full h-8 bg-gradient-to-b from-canvas to-transparent" />
      </div>

      {g.steps.map((s, i) => (
        <section
          key={i}
          ref={(el) => {
            sections.current[i] = el;
          }}
          data-i={i}
          className={`snap-start py-5 ${jumping ? "snap-normal" : "snap-always"} transition-opacity duration-300 ${i === step ? "opacity-100" : "opacity-40"}`}
        >
          <p className="text-sm font-semibold text-accent tabular-nums">{g.step(i + 1, n)}</p>
          <h2 className="mt-0.5 text-2xl font-extrabold tracking-tight">{s.h}</h2>
          <p className="mt-1.5 text-base leading-relaxed text-muted">{s.p}</p>
        </section>
      ))}

      <div ref={end} className="pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <Link href="/" className={btn}>
          {g.go} <ChevronRight className="size-5" aria-hidden />
        </Link>
      </div>
      <div aria-hidden className="snap-end" style={{ height: tail }} />
    </main>
  );
}

/** the scene: a stage with the bowl at its heart; positions in container units. Drawn at one size and scaled as a
 *  picture (CSS zoom would scale the container units twice in WebKit) */
function Stage({ step, zoom }: { step: number; zoom: number }) {
  const t = useT();
  const scene = SCENES[step];
  return (
    <div aria-hidden className="mx-auto" style={{ width: STAGE_W * zoom, height: STAGE_H * zoom }}>
      <div
        className={`relative origin-top-left overflow-hidden rounded-4xl ${TINT[step]} transition-colors duration-500 [container-type:size]`}
        style={{ width: STAGE_W, height: STAGE_H, scale: String(zoom) }}
      >
        {scene === "teams" && <Teams />}

        {PLAYERS.map((p, i) => {
          const { x, y } = spot(i, step);
          const team = step > 0 ? (p.team === 0 ? "bg-team-a text-white" : "bg-team-b text-white") : "bg-surface text-ink";
          return (
            <span
              key={p.name}
              className={`absolute top-1/2 left-1/2 rounded-full px-3 py-1 text-sm font-bold shadow-sm transition-[translate,scale,background-color,color] duration-500 ease-spring ${team}`}
              style={{ translate: `calc(-50% + ${x}cqw) calc(-50% + ${y}cqh)`, scale: step >= at("explain") ? "0.85" : "1", transitionDelay: `${i * 60}ms` } as CSSProperties}
            >
              {p.name}
            </span>
          );
        })}

        {scene === "setup" && <Setup />}

        {/* writing: four slips pop up in a row, then drop into the bowl one after the other */}
        {scene === "write" &&
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
        {(scene === "explain" || scene === "pass") && (
          <Turn key={scene} dir={scene === "explain" ? "right" : "left"} word={scene === "explain" ? WORDS[0] : WORDS[1]} label={scene === "explain" ? t.got : t.next} />
        )}

        {scene === "heckle" && <Heckle />}

        {scene === "rounds" && <Rounds />}

        {scene === "draw" && <Draw />}

        {scene === "win" && (
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

        {scene !== "teams" && scene !== "setup" && <StageBowl key={`bowl-${step}`} step={step} />}
      </div>
    </div>
  );
}

/** the bowl: empty until the slips are written, then it holds them (one is out while a turn is on). Remounted with
 *  every chapter, so the writing chapter always starts empty and fills when its slips have dropped in */
function StageBowl({ step }: { step: number }) {
  const scene = SCENES[step];
  const [landed, setLanded] = useState(step > at("write"));
  useEffect(() => {
    if (scene !== "write") return;
    const id = setTimeout(() => setLanded(true), 2300);
    return () => clearTimeout(id);
  }, [scene]);
  const count = !landed ? 0 : scene === "explain" || scene === "pass" || scene === "heckle" || scene === "draw" ? 3 : 4;
  return <Bowl count={count} className={`absolute bottom-[6%] left-1/2 w-[46cqw] -translate-x-1/2 ${scene === "win" ? "translate-y-[4cqh]" : ""}`} />;
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
      <div className="flex gap-2.5">
        {ONLINE_DEFAULT_ROUNDS.map((r, k) => (
          <span key={r} className={`grid size-11 place-items-center rounded-2xl shadow-sm transition-colors duration-300 ${k === i ? "bg-accent text-canvas" : "bg-surface text-muted"}`}>
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

/** two teams, each on its own mat with its funny name; below, the count ticks through two, three and four teams */
function Teams() {
  const t = useT();
  const [k, setK] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setK((x) => (x + 1) % 4), 1400);
    return () => clearInterval(id);
  }, []);
  const count = [2, 3, 4, 3][k];
  return (
    <>
      {[0, 1].map((team) => (
        <div
          key={team}
          className={`absolute top-1/2 left-1/2 flex h-[40cqh] w-[40cqw] flex-col items-center justify-end rounded-3xl pb-2 ${team ? "bg-team-b/15" : "bg-team-a/15"}`}
          style={{ translate: `calc(-50% + ${team ? 29 : -29}cqw) calc(-50% - 21cqh)` }}
        >
          <span className={`max-w-full truncate px-2 text-xs font-extrabold ${team ? "text-team-b" : "text-team-a"}`}>{t.funnyTeams[team]}</span>
        </div>
      ))}
      <div className="absolute bottom-[9%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="flex gap-2">
          {TEAM_BG.map((bg, i) => (
            <span key={bg} className={`grid size-10 place-items-center rounded-full text-white shadow-sm transition-[opacity,scale] duration-300 ${bg} ${i < count ? "opacity-100" : "scale-75 opacity-20"}`}>
              <Users className="size-5" aria-hidden />
            </span>
          ))}
        </div>
        <p key={count} className="bump text-base font-extrabold tabular-nums">
          {t.sumTeams(count)}
        </p>
      </div>
    </>
  );
}

/** heckling: the other team presses its button, and the explainer's slip shakes and blurs, then settles; over and over */
function Heckle() {
  const t = useT();
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), 3600);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      <p key={`m${n}`} className="guide-pop absolute top-[8%] left-[6%] text-base font-extrabold text-team-b">
        {t.heckled("Nora")}
      </p>
      <span key={`b${n}`} className="bump absolute top-[6%] right-[6%] inline-flex items-center gap-1 rounded-full bg-team-b px-3 py-1 text-sm font-bold text-white shadow-sm">
        <Zap className="size-4" aria-hidden /> {t.heckle}
      </span>
      <div className="absolute top-[30%] left-1/2 -translate-x-1/2">
        <div key={n} className="heckle-fx">
          <Slip tilt={-2} className="px-5 pt-2 pb-3">
            <span className="font-hand text-4xl font-bold whitespace-nowrap">{WORDS[2]}</span>
          </Slip>
        </div>
      </div>
    </>
  );
}

/** the host's settings, ticking over: one phone leaves drawing out, several phones bring it in */
function Setup() {
  const t = useT();
  const [k, setK] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setK((x) => (x + 1) % 4), 1400);
    return () => clearInterval(id);
  }, []);
  const many = k % 2 === 1;
  const rows: [string, number][] = [
    [t.perPlayer, [4, 5, 6, 5][k]],
    [t.seconds, [30, 45, 60, 45][k]],
  ];
  // below the teams, where the bowl would be
  return (
    <div className="absolute bottom-[4%] left-1/2 flex w-[80cqw] -translate-x-1/2 flex-col gap-1.5 rounded-2xl bg-surface px-3 py-2.5 shadow-sm">
      <div className="flex gap-1.5">
        {[false, true].map((m) => (
          <span key={String(m)} className={`flex flex-1 items-center justify-center rounded-full py-1 transition-colors duration-300 ${m === many ? "bg-accent text-canvas" : "bg-raised text-muted"}`}>
            {(m ? [0, 1, 2] : [0]).map((i) => (
              <Smartphone key={i} className="-mx-0.5 size-4" aria-hidden />
            ))}
          </span>
        ))}
      </div>
      {rows.map(([label, value]) => (
        <p key={label} className="flex items-center justify-between gap-2 text-sm font-semibold text-muted">
          {label}
          <span key={value} className="bump text-base font-extrabold text-ink tabular-nums">
            {value}
          </span>
        </p>
      ))}
      <div className="flex justify-between px-1">
        {ROUND_TYPES.map((r) => (
          <RoundIcon key={r} type={r} className={`size-5 transition-opacity duration-300 ${r !== "draw" || many ? "text-ink" : "text-muted opacity-30"}`} />
        ))}
      </div>
    </div>
  );
}

/** drawing: the Matterhorn, stroke by stroke, then the team has it; over and over */
function Draw() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), 3200);
    return () => clearInterval(id);
  }, []);
  return (
    // a flipchart: white sheet under a clamp bar, on easel legs, drawn in marker (paper colours stay light in dark mode)
    <div className="absolute top-[4%] left-1/2 w-[50cqw] -translate-x-1/2">
      <div className="relative z-10 mx-[-4%] h-2.5 rounded-full bg-ink-black" />
      <div className="relative -mt-1 rounded-b-md bg-white px-2 pt-2 pb-2">
      <svg key={n} viewBox="0 0 100 56" className="w-full text-paper-ink" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path className="draw" pathLength={100} style={{ "--len": 100 } as CSSProperties} d="M4 52 L30 30 L40 34 L56 6 L64 18 L70 16 L96 52" />
        <path className="draw" pathLength={100} style={{ "--len": 100, animationDelay: "0.9s" } as CSSProperties} d="M47 22 L53 25 L58 18 L64 22" />
      </svg>
      </div>
      {/* the easel's legs, tucked under the sheet */}
      <div className="relative h-[13cqh]">
        {[-14, 14].map((r) => (
          <span key={r} className="absolute top-0 h-full w-1.5 origin-top rounded-b-full bg-muted" style={{ left: r < 0 ? "22%" : "74%", rotate: `${r}deg` }} />
        ))}
        <span className="absolute top-0 left-1/2 h-4/5 w-1.5 -translate-x-1/2 rounded-b-full bg-muted" />
      </div>
      <span key={`l${n}`} className="guide-label absolute top-full left-0 mt-1 w-full text-center font-hand text-2xl font-bold text-accent">
        {WORDS[0]}!
      </span>
    </div>
  );
}
