"use client";

import { ArrowLeftRight, Check, ChevronDown, ChevronUp, Crown, Infinity as Inf, Minus, Pencil, Plus, Share2, Shuffle, Smartphone, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { pickOne } from "@/lib/i18n";
import { useT } from "@/lib/prefs";
import { ROUND_TYPES, type Action, type Settings, type Team, type View } from "@/lib/room";
import { Bowl, btn, btn2, buzz, field, ghost, panel, press, round_btn, RoundIcon, Slip, TEAM, TimerRing } from "@/lib/ui";
import { Stats } from "./Stats";

export type Mode = "online" | "local";
/** `as`: in one-phone games, act as that player; online always acts as this phone's player */
export type Send = (a: Action, as?: number) => Promise<void>;
type P = { v: View; send: Send; busy: boolean; mode: Mode };

const SWIPE = 90; // px to count as a swipe
const mini = `grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink disabled:opacity-25 ${press}`;

export function Waiting({ text }: { text: string }) {
  return (
    <p className="enter flex items-center justify-center gap-2 py-3 text-center text-muted">
      <span className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-accent" /> {text}
    </p>
  );
}

export function Cta({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-20 -mx-4 mt-auto bg-gradient-to-t from-canvas from-70% to-transparent px-4 pt-6 pb-1">{children}</div>;
}

export function Score({ v }: { v: View }) {
  const tot = [0, 1].map((t) => v.scores.reduce((s, r) => s + r[t], 0));
  return (
    <div className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-lg font-bold tabular-nums" aria-label={`${v.teamNames[0]} ${tot[0]}, ${v.teamNames[1]} ${tot[1]}`}>
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
}

function RoundCard({ v, n, className = "" }: { v: View; n: number; className?: string }) {
  const t = useT();
  const type = v.settings.rounds[n];
  return (
    <section className={`${panel} flex gap-4 ${className}`}>
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-raised text-accent">
        <RoundIcon type={type} className="size-7" />
      </span>
      <div>
        <p className="text-sm text-muted">{t.roundOf(n + 1, v.settings.rounds.length)}</p>
        <h2 className="text-2xl font-extrabold tracking-tight">{t.round[type].name}</h2>
        <p className="mt-1 text-muted">{t.round[type].rule}</p>
      </div>
    </section>
  );
}

/** a name with a pencil; tap to edit inline */
function EditableName({ value, label, onSave, className = "" }: { value: string; label: string; onSave: (n: string) => void; className?: string }) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null)
    return (
      <button onClick={() => setDraft(value)} aria-label={`${label}: ${t.rename}`} className={`group flex min-w-0 items-center gap-1.5 text-left ${className}`}>
        <span className="min-w-0 break-words">{value}</span>
        <Pencil className="size-3.5 shrink-0 opacity-50 group-hover:opacity-100" aria-hidden />
      </button>
    );
  const save = () => {
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
    setDraft(null);
  };
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input autoFocus value={draft} maxLength={24} aria-label={label} onChange={(e) => setDraft(e.target.value)} onBlur={save} className="min-w-0 flex-1 rounded-lg bg-canvas px-2 py-1 font-semibold text-ink outline-none" />
      <button aria-label={t.save} className={mini}>
        <Check className="size-4" aria-hidden />
      </button>
    </form>
  );
}

function Stepper({ label, value, display, set, min, max }: { label: string; value: number; display?: ReactNode; set: (n: number) => void; min: number; max: number }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="font-medium">{label}</span>
      <div className="flex shrink-0 items-center gap-1">
        <button onClick={() => set(value - 1)} disabled={value <= min} className={round_btn} aria-label={t.less(label)}>
          <Minus className="size-5" aria-hidden />
        </button>
        <span key={value} className="pop grid w-12 place-items-center text-xl font-bold tabular-nums">
          {display ?? value}
        </span>
        <button onClick={() => set(value + 1)} disabled={value >= max} className={round_btn} aria-label={t.more(label)}>
          <Plus className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ---------- lobby ----------

export function Lobby({ v, send, busy, mode, share, onAdd }: P & { share?: { qr: string; copied: boolean; onShare: () => void }; onAdd?: (name: string) => Promise<void> }) {
  const t = useT();
  const s = v.settings;
  const local = mode === "local";
  const set = (patch: Partial<Settings>) => send({ type: "settings", settings: patch });
  const counts = [0, 1].map((x) => v.players.filter((p) => p.team === x).length);
  const canStart = counts.every((c) => c >= 2);
  const mine = v.players[v.me]?.team ?? 0;
  const skipStep = s.skips === -1 ? 6 : s.skips; // stepper runs 0…5, then ∞
  const off = ROUND_TYPES.filter((r) => !s.rounds.includes(r));
  const move = (i: number, d: number) => {
    const r = [...s.rounds];
    [r[i], r[i + d]] = [r[i + d], r[i]];
    set({ rounds: r });
  };
  const [adding, setAdding] = useState(() => pickOne(t.funnyPlayers));
  const addPlayer = async () => {
    if (!adding.trim() || !onAdd) return;
    await onAdd(adding.trim());
    setAdding(pickOne(t.funnyPlayers.filter((n) => !v.players.some((p) => p.name === n))));
  };

  return (
    <div key="lobby" className="enter flex flex-1 flex-col gap-4">
      {share && (
        <section className={`${panel} flex items-center gap-4`}>
          {share.qr && (
            // eslint-disable-next-line @next/next/no-img-element -- local data: URL, nothing to optimise
            <img src={share.qr} alt={`QR ${v.code}`} width={132} height={132} className="pop size-33 shrink-0 rounded-xl" />
          )}
          <div className="flex min-w-0 flex-col items-start gap-1">
            <p className="text-sm text-muted">{t.scanOrCode}</p>
            <p className="text-4xl font-extrabold tracking-[0.25em] text-hi">{v.code}</p>
            <button onClick={share.onShare} className={`${ghost} -ml-3 flex items-center gap-2 text-accent`}>
              {share.copied ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
              {share.copied ? t.copied : t.share}
            </button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        {([0, 1] as const).map((ti) => (
          <div key={ti} className={`rounded-3xl px-4 py-3 ${TEAM[ti].soft}`}>
            <div className={`flex items-center justify-between gap-2 text-lg font-extrabold ${TEAM[ti].text}`}>
              {local || v.isHost || mine === ti ? (
                <EditableName value={v.teamNames[ti]} label={t.teamName} onSave={(name) => send({ type: "teamName", team: ti, name })} />
              ) : (
                <span className="truncate">{v.teamNames[ti]}</span>
              )}
              <span key={counts[ti]} className="pop shrink-0 text-sm tabular-nums">
                {counts[ti]}
              </span>
            </div>
            <ul className="mt-2 flex flex-col gap-1">
              {v.players.map((p, i) =>
                p.team === ti ? (
                  <li key={i} className="pop flex min-h-9 items-center gap-1 font-medium">
                    {local || i === v.me ? (
                      <EditableName value={p.name} label={t.yourName} onSave={(name) => send({ type: "rename", name }, i)} className="flex-1" />
                    ) : (
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    )}
                    {!local && i === v.me && <span className="shrink-0 text-sm text-muted">({t.you})</span>}
                    {!local && i === v.hostIndex && <Crown className="size-4 shrink-0 text-hi" aria-label={t.host} />}
                    {local && (
                      <button onClick={() => send({ type: "team", team: (1 - p.team) as Team }, i)} disabled={busy} aria-label={t.switchTo(v.teamNames[1 - p.team])} className={mini}>
                        <ArrowLeftRight className="size-4" aria-hidden />
                      </button>
                    )}
                    {v.isHost && i !== v.hostIndex && (
                      <button onClick={() => send({ type: "kick", player: i })} disabled={busy} aria-label={`${p.name} ×`} className={mini}>
                        <X className="size-4" aria-hidden />
                      </button>
                    )}
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        ))}
      </section>

      {onAdd ? (
        <form
          className="-mt-1 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addPlayer();
          }}
        >
          <input value={adding} onChange={(e) => setAdding(e.target.value)} onFocus={(e) => e.target.select()} maxLength={24} aria-label={t.yourName} className={`${field} min-w-0 flex-1 py-2.5 font-semibold`} />
          <button disabled={busy || !adding.trim() || v.players.length >= 20} aria-label="+" className={`${btn2} w-auto! shrink-0 px-4`}>
            <UserPlus className="size-5" aria-hidden />
          </button>
        </form>
      ) : null}
      <div className="-mt-1 flex gap-2">
        {!local && (
          <button onClick={() => send({ type: "team", team: (1 - mine) as Team })} disabled={busy} className={btn2}>
            <ArrowLeftRight className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t.switchTo(v.teamNames[1 - mine])}</span>
          </button>
        )}
        {v.isHost && (
          <button onClick={() => send({ type: "shuffle" })} disabled={busy} className={`${btn2} ${local ? "" : "w-auto! shrink-0"}`}>
            <Shuffle className="size-4" aria-hidden /> {t.shuffle}
          </button>
        )}
      </div>

      <section className={panel}>
        <h2 className="text-lg font-bold">{t.settings}</h2>
        {v.isHost ? (
          <>
            <div className="mt-2 divide-y divide-line">
              <Stepper label={t.perPlayer} value={s.perPlayer} set={(n) => set({ perPlayer: n })} min={1} max={10} />
              <Stepper label={t.seconds} value={s.seconds} set={(n) => set({ seconds: s.seconds + (n - s.seconds) * 5 })} min={10} max={120} />
              <Stepper label={t.skips} value={skipStep} display={s.skips === -1 ? <Inf className="size-6" aria-label="∞" /> : undefined} set={(n) => set({ skips: n >= 6 ? -1 : n })} min={0} max={6} />
            </div>
            <h3 className="mt-4 font-semibold">{t.rounds}</h3>
            <p className="text-sm text-muted">{t.roundsHelp}</p>
            <ol className="mt-3 flex flex-col gap-2">
              {s.rounds.map((r, i) => (
                <li key={r} className="enter flex items-center gap-2.5 rounded-2xl bg-raised py-1.5 pr-1.5 pl-3">
                  <span className="w-3 shrink-0 text-sm font-bold text-muted tabular-nums">{i + 1}</span>
                  <RoundIcon type={r} className="size-5 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{t.round[r].name}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={t.earlier(t.round[r].name)} className={mini}>
                    <ChevronUp className="size-5" aria-hidden />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === s.rounds.length - 1} aria-label={t.later(t.round[r].name)} className={mini}>
                    <ChevronDown className="size-5" aria-hidden />
                  </button>
                  <button onClick={() => set({ rounds: s.rounds.filter((x) => x !== r) })} disabled={s.rounds.length === 1} aria-label={t.drop(t.round[r].name)} className={mini}>
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
              {off.map((r) => (
                <li key={r}>
                  <button onClick={() => set({ rounds: [...s.rounds, r] })} aria-label={t.addRound(t.round[r].name)} className={`flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-line py-2.5 pr-2 pl-3 text-left text-muted ${press}`}>
                    <Plus className="size-4 shrink-0" aria-hidden />
                    <RoundIcon type={r} className="size-5 shrink-0" />
                    <span className="flex-1 font-semibold">{t.round[r].name}</span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-muted">
            <li>{t.sumPerPlayer(s.perPlayer)}</li>
            <li>{t.sumSeconds(s.seconds)}</li>
            <li>{t.sumSkips(s.skips)}</li>
            <li className="mt-2 flex flex-wrap gap-2">
              {s.rounds.map((r, i) => (
                <span key={r} className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1 text-sm text-ink">
                  <RoundIcon type={r} className="size-4 text-accent" />
                  {i + 1}. {t.round[r].name}
                </span>
              ))}
            </li>
          </ul>
        )}
      </section>

      <Cta>
        {v.isHost ? (
          <button onClick={() => send({ type: "start" })} disabled={busy || !canStart} className={btn}>
            {canStart ? t.start : t.needTwo}
          </button>
        ) : (
          <Waiting text={t.hostStarts(v.players[v.hostIndex]?.name ?? "")} />
        )}
      </Cta>
    </div>
  );
}

// ---------- write ----------

export function Write({ v, send, busy }: P) {
  const t = useT();
  const [draft, setDraft] = useState<string[]>(() => Array.from({ length: v.settings.perPlayer }, () => ""));
  if (v.iDone)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="relative h-40 w-48">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="fall absolute top-6 h-10 w-8 rounded-sm bg-paper"
              style={{ left: `${30 + i * 18}%`, animationDelay: `${i * 0.5}s`, "--r0": `${-20 + i * 15}deg`, "--r1": `${10 - i * 12}deg` } as CSSProperties}
            />
          ))}
          <Bowl className="absolute bottom-0 left-1/2 w-40 -translate-x-1/2" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight">{t.wordsIn}</h2>
        <p className="text-muted">
          <span key={v.done} className="bump font-bold text-ink tabular-nums">
            {t.done(v.done, v.players.length)}
          </span>
          . {t.soon}
        </p>
      </div>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send({ type: "words", words: draft });
      }}
      className="enter flex flex-1 flex-col gap-5"
    >
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight">{t.writeTitle(draft.length)}</h2>
        <p className="mt-1 text-muted">{t.writeHelp}</p>
      </div>
      <div className="flex flex-col gap-4">
        {draft.map((d, i) => (
          <Slip key={i} tilt={i % 2 ? 1.2 : -1.2} className="unfold px-4 pt-2" style={{ animationDelay: `${i * 0.06}s` }}>
            <input
              autoFocus={i === 0}
              autoComplete="off"
              maxLength={40}
              value={d}
              aria-label={t.slip(i + 1)}
              placeholder={t.slip(i + 1)}
              onChange={(e) => setDraft(draft.map((x, j) => (j === i ? e.target.value : x)))}
              className="font-hand w-full bg-transparent text-3xl font-bold outline-none placeholder:text-paper-ink/30"
            />
          </Slip>
        ))}
      </div>
      <Cta>
        <button disabled={busy || draft.some((d) => !d.trim())} className={btn}>
          {t.intoBowl}
        </button>
        <p className="mt-2 text-center text-sm text-muted tabular-nums">{t.done(v.done, v.players.length)}</p>
      </Cta>
    </form>
  );
}

/** one-phone games: hand the phone over before anything secret shows */
export function PassPhone({ name, team, onReady, label }: { name: string; team: Team; onReady: () => void; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <span className="pop grid size-20 place-items-center rounded-3xl bg-raised">
        <Smartphone className={`size-10 ${TEAM[team].text}`} aria-hidden />
      </span>
      <p className="enter text-lg text-muted">{label}</p>
      <h1 className={`enter text-5xl font-extrabold tracking-tight break-words ${TEAM[team].text}`}>{name}</h1>
      <Cta>
        <button onClick={onReady} className={btn}>
          {name}
        </button>
      </Cta>
    </div>
  );
}

// ---------- between turns ----------

export function Ready({ v, send, busy, mode }: P) {
  const t = useT();
  const d = v.active!;
  const p = v.players[d];
  const me = d === v.me;
  const local = mode === "local";
  const last = v.lastTurn && v.lastTurn.r === v.round ? v.lastTurn : null;
  const carry = Math.round(v.carryMs / 1000);
  return (
    <div className="flex flex-1 flex-col gap-4">
      <RoundCard v={v} n={v.round} className="enter" />
      {last && (
        <p className="pop self-center rounded-full bg-surface px-4 py-2 text-center">
          {t.gotLast(v.players[last.p].name, last.got)}
        </p>
      )}
      <div className="enter flex flex-1 flex-col items-center justify-center gap-2 text-center [animation-delay:120ms]">
        <Bowl count={v.bowlLeft} className="w-28" />
        <p className="mt-3 text-muted">{me && !local ? t.yourTurn : t.upNext}</p>
        <h1 className={`text-5xl font-extrabold tracking-tight break-words ${TEAM[p.team].text}`}>{me && !local ? t.youBang : p.name}</h1>
        <p className="text-muted">
          {t.forTeam(v.teamNames[p.team])}
          {carry > 0 && `, ${t.carry(carry)}`}
        </p>
      </div>
      <Cta>
        {me ? (
          <button onClick={() => send({ type: "go" }, d)} disabled={busy} className={btn}>
            {t.go}
          </button>
        ) : (
          <Waiting text={v.players[v.me]?.team === p.team ? t.youGuess(p.name) : t.youListen(p.name)} />
        )}
        {v.isHost && (
          <button onClick={() => send({ type: "pass" })} disabled={busy} className={`${ghost} w-full text-sm`}>
            {t.notHere(p.name)}
          </button>
        )}
      </Cta>
    </div>
  );
}

// ---------- the turn ----------

function SwipeSlip({ text, locked, canSkip, fling, onSwipe }: { text: string; locked: boolean; canSkip: boolean; fling: "r" | "l" | null; onSwipe: (d: "r" | "l") => void }) {
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
    if (dx > SWIPE) onSwipe("r");
    else if (dx < -SWIPE && canSkip) onSwipe("l");
    else if (dx < -SWIPE) setShake((n) => n + 1); // no skips left
    setDx(0);
  };
  const size = text.length > 22 ? "text-4xl" : text.length > 12 ? "text-5xl" : "text-6xl";
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
        <Slip tilt={-1.5} className={`unfold relative px-5 pt-10 pb-12 text-center ${locked ? "opacity-70 grayscale" : ""}`}>
          <p data-testid="word" className={`font-hand leading-none font-bold break-words ${size}`}>
            {text}
          </p>
          {/* stamps that fade in while dragging */}
          <span className="absolute top-3 left-4 -rotate-12 rounded-md border-2 border-[#0a8a3a] px-2 text-sm font-extrabold text-[#0a8a3a]" style={{ opacity: Math.max(0, Math.min(1, dx / SWIPE)) }}>
            {t.stampGot}
          </span>
          <span className="absolute top-3 right-4 rotate-12 rounded-md border-2 border-paper-ink/60 px-2 text-sm font-extrabold text-paper-ink/60" style={{ opacity: Math.max(0, Math.min(1, -dx / SWIPE)) }}>
            {canSkip ? t.stampSkip : t.stampNoSkip}
          </span>
        </Slip>
      </div>
      {locked && (
        <p className="pop absolute inset-x-0 top-1/2 mx-auto w-max -translate-y-1/2 -rotate-6 rounded-xl bg-cta px-5 py-2 text-3xl font-extrabold text-cta-ink shadow-xl">{t.timeUp}</p>
      )}
    </div>
  );
}

export function Turn({ v, left, send }: P & { left: number }) {
  const t = useT();
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
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* always visible: time, score this turn, bowl */}
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
      <div className="flex items-start gap-2 rounded-2xl bg-surface px-3 py-2 text-sm text-muted">
        <RoundIcon type={type} className="mt-0.5 size-4 shrink-0 text-accent" />
        <p>
          <b className="text-ink">{t.round[type].name}:</b> {t.round[type].rule}
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        {v.word && <SwipeSlip key={v.word.id} text={v.word.text} locked={up} canSkip={v.canSkip} fling={fling} onSwipe={act} />}
        {!up && <p className="mt-4 text-center text-sm text-muted">{t.swipeHint}</p>}
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

      <div className="grid grid-cols-[1fr_1.6fr] gap-3 pb-1">
        <button onClick={() => act("l")} disabled={up || !!fling || !v.canSkip} className={`${btn2} min-h-14 flex-col gap-0 leading-tight`}>
          {t.next}
          {v.settings.skips !== -1 && <span className="text-xs font-medium text-muted">{t.left(v.settings.skips - v.held.length)}</span>}
        </button>
        <button onClick={() => act("r")} disabled={up || !!fling} className={btn}>
          <Check className="size-5" aria-hidden /> {t.got}
        </button>
      </div>
    </div>
  );
}

// ---------- round over ----------

export function RoundEnd({ v, send, busy }: P) {
  const t = useT();
  const r = v.scores[v.round];
  const carry = Math.round(v.carryMs / 1000);
  const starter = v.lastTurn ? v.players[v.lastTurn.p] : null;
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="pop flex flex-col items-center gap-2 pt-4 text-center">
        <Bowl count={0} className="w-28" />
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight">{t.bowlEmpty}</h1>
        <p className="text-muted">{t.roundDone(t.round[v.settings.rounds[v.round]].name)}</p>
      </div>
      <section className={`${panel} enter grid grid-cols-2 gap-3 text-center [animation-delay:100ms]`}>
        {([0, 1] as const).map((i) => (
          <div key={i} className="min-w-0">
            <p className={`truncate font-semibold ${TEAM[i].text}`}>{v.teamNames[i]}</p>
            <p className="text-4xl font-extrabold tabular-nums">+{r[i]}</p>
          </div>
        ))}
      </section>
      <RoundCard v={v} n={v.round + 1} className="enter [animation-delay:200ms]" />
      {starter && carry > 0 && <p className="enter text-center text-muted [animation-delay:260ms]">{t.starts(starter.name, carry)}</p>}
      <Cta>
        {v.isHost ? (
          <button onClick={() => send({ type: "nextRound" })} disabled={busy} className={btn}>
            {t.startRound(v.round + 2)}
          </button>
        ) : (
          <Waiting text={t.hostNextRound(v.players[v.hostIndex]?.name ?? "")} />
        )}
      </Cta>
    </div>
  );
}

export function End({ v, send, busy, mode }: P) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <Stats v={v} showMe={mode === "online"} />
      <Cta>
        {v.isHost ? (
          <button onClick={() => send({ type: "lobby" })} disabled={busy} className={btn}>
            {t.again}
          </button>
        ) : (
          <Waiting text={t.hostAgain(v.players[v.hostIndex]?.name ?? "")} />
        )}
      </Cta>
    </div>
  );
}

/** every phase of a running game; lobby and joining are handled by the page */
export function Phase(props: P & { left: number }) {
  const { v } = props;
  if (v.phase === "write") return <Write key={`w${v.settings.perPlayer}-${v.me}`} {...props} />;
  if (v.phase === "ready") return <Ready key={`r${v.turnNo}-${v.round}`} {...props} />;
  if (v.phase === "turn") return <Turn key={`t${v.turnNo}`} {...props} />;
  if (v.phase === "roundEnd") return <RoundEnd {...props} />;
  if (v.phase === "end") return <End {...props} />;
  return null;
}
