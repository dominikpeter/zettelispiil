"use client";

import { AlertTriangle, ArrowLeft, ArrowLeftRight, Check, Eraser, Loader2, Sparkles, Home, Pause, Play, ChevronDown, Crown, GripVertical, Infinity as Inf, Minus, Pencil, Plus, Share2, Shuffle, Smartphone, UserPlus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move as moved } from "@dnd-kit/helpers";
import { useAiOn, useAiRoom } from "@/lib/aiAccess";
import { useHints, useT } from "@/lib/prefs";
import { LANGS } from "@/lib/i18n";
import { Segmented } from "./TopControls";
import { funnyName } from "@/lib/roomClient";
import { norm, ROUND_TYPES, type Action, type RoundType, type Stroke, type Settings, type Slip as SlipT, type Team, type View } from "@/lib/room";
import { Bowl, btn, btn2, buzz, field, fitLine, ghost, panel, pill, pillBtn, press, round_btn, RoundIcon, Slip, TEAM, TimerRing, WhatsAppIcon, whatsappHref } from "@/lib/ui";
import { DrawPad, DrawView, INKS } from "./DrawBoard";
import { Stats } from "./Stats";
import { SettingsPanel } from "./TopControls";

export type Mode = "online" | "local";
/** `as`: in one-phone games, act as that player; online always acts as this phone's player */
export type Send = (a: Action, as?: number) => Promise<void>;
/** every-phone games: the room code and the drawer's line sender (fire-and-forget) */
export type Live = { code: string; draw: (sheet: number, strokes: Stroke[]) => void };
type P = { v: View; send: Send; busy: boolean; mode: Mode; live?: Live };

const SWIPE = 90; // px to count as a swipe
const mini = `grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink disabled:opacity-25 ${press}`;

export function Waiting({ text }: { text: string }) {
  return (
    <p className="enter flex items-center justify-center gap-2 py-3 text-center text-muted">
      <span className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-accent" /> {text}
    </p>
  );
}

export function Cta({ children }: { children: ReactNode }) {
  // own bottom padding: clears the iPhone home bar and leaves room for the button's 3D edge
  return <div className="sticky bottom-0 z-20 -mx-4 mt-auto bg-gradient-to-t from-canvas from-75% to-transparent px-4 pt-6 pb-[max(0.9rem,env(safe-area-inset-bottom))]">{children}</div>;
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

/** the rule of a round; with one phone, drawing happens on a flip chart or paper */
const ruleOf = (t: ReturnType<typeof useT>, type: RoundType, mode: Mode) => (type === "draw" && mode === "local" ? t.drawPaper : t.round[type].rule);

function RoundCard({ v, n, mode, className = "" }: { v: View; n: number; mode: Mode; className?: string }) {
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
        <p className="mt-1 text-muted">{ruleOf(t, type, mode)}</p>
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
      <input autoFocus value={draft} maxLength={24} aria-label={label} onChange={(e) => setDraft(e.target.value)} onBlur={save} className="min-w-0 flex-1 rounded-lg bg-canvas px-2 py-1 font-semibold text-ink outline-none ring-2 ring-accent" />
      <button aria-label={t.save} className={mini}>
        <Check className="size-4" aria-hidden />
      </button>
    </form>
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

function Stepper({ label, value, display, set, min, max }: { label: string; value: number; display?: ReactNode; set: (n: number) => void; min: number; max: number }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3 py-2 max-xs:flex-col max-xs:items-stretch max-xs:gap-1">
      <span className="font-medium">{label}</span>
      <div className="flex shrink-0 items-center gap-1 max-xs:self-end">
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

// a round in the host's list: drag it by the handle (long-press on touch; keyboard: focus the handle, Space, arrow keys, Space)
function RoundRow({ r, i, children }: { r: RoundType; i: number; children: ReactNode }) {
  const t = useT();
  const { ref, handleRef, isDragging } = useSortable({ id: r, index: i });
  return (
    <li ref={ref} data-round={r} className={`enter flex items-center gap-2 rounded-2xl bg-raised py-1.5 pr-1 ${isDragging ? "relative z-10 shadow-lg ring-2 ring-accent" : ""}`}>
      <button ref={handleRef} type="button" aria-label={t.moveRound(t.round[r].name)} className="flex min-w-0 flex-1 cursor-grab items-center gap-2 self-stretch rounded-xl pl-1.5 text-left select-none active:cursor-grabbing">
        <GripVertical className="size-4 shrink-0 text-muted max-xs:hidden" aria-hidden />
        <span className="w-3 shrink-0 text-sm font-bold text-muted tabular-nums">{i + 1}</span>
        <RoundIcon type={r} className="size-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate font-semibold">{t.round[r].name}</span>
      </button>
      {children}
    </li>
  );
}

export function Lobby({ v, send, busy, mode, share, onAdd }: P & { share?: { qr: string; copied: boolean; onShare: () => void; url: string }; onAdd?: (name: string) => Promise<void> }) {
  const t = useT();
  // only the host edits settings: show their taps at once, and send them one after another so quick taps never race
  const [pending, setPending] = useState<Partial<Settings>>({});
  const s = { ...v.settings, ...pending };
  const aiRoom = useAiRoom();
  const aiOn = useAiOn();
  const queue = useRef(Promise.resolve());
  const local = mode === "local";
  const set = (patch: Partial<Settings>) => {
    setPending((m) => ({ ...m, ...patch }));
    queue.current = queue.current.then(() => send({ type: "settings", settings: patch }));
  };
  const counts = [0, 1].map((x) => v.players.filter((p) => p.team === x).length);
  const canStart = counts.every((c) => c >= 2);
  const mine = v.players[v.me]?.team ?? 0;
  const skipStep = s.skips === -1 ? 6 : s.skips; // stepper runs 0…5, then ∞
  const off = ROUND_TYPES.filter((r) => !s.rounds.includes(r));
  const [adding, setAdding] = useState("");
  const addPlayer = async () => {
    if (!adding.trim() || !onAdd) return;
    await onAdd(adding.trim());
    setAdding("");
  };

  return (
    <div key="lobby" className="enter flex flex-1 flex-col gap-4">
      {aiRoom && aiOn && (
        <p className="flex items-center gap-2 rounded-2xl bg-raised px-4 py-2.5 text-sm font-medium">
          <Sparkles className="size-4 shrink-0 text-accent" aria-hidden /> {t.roomAi}
        </p>
      )}
      {share && (
        <section className={`${panel} flex items-center gap-4`}>
          {share.qr && (
            // eslint-disable-next-line @next/next/no-img-element -- local data: URL, nothing to optimise
            <img src={share.qr} alt={`QR ${v.code}`} width={132} height={132} className="pop size-33 shrink-0 rounded-xl" />
          )}
          <div className="flex min-w-0 flex-col items-start gap-1">
            <p className="text-sm text-muted">{t.scanOrCode}</p>
            <p translate="no" className="text-3xl font-extrabold tracking-[0.18em] text-hi">{v.code}</p>
            <div className="-ml-3 flex flex-col items-start">
              <button onClick={share.onShare} className={`${ghost} flex items-center gap-2 text-accent`}>
                {share.copied ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
                {share.copied ? t.copied : t.share}
              </button>
              <a href={whatsappHref(`${t.shareText(v.code)} ${share.url}`)} target="_blank" rel="noopener noreferrer" aria-label={t.whatsapp} className={`${ghost} flex items-center gap-2 font-semibold text-ink`}>
                <WhatsAppIcon className="size-5 text-whatsapp" /> WhatsApp
              </a>
            </div>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        {([0, 1] as const).map((ti) => (
          <div key={ti} className={`rounded-3xl px-4 py-3 ${TEAM[ti].soft}`}>
            <div className={`flex items-center justify-between gap-2 text-lg font-extrabold ${TEAM[ti].text}`}>
              {local || v.isHost || mine === ti ? (
                <span className="flex min-w-0 items-center gap-1">
                  <EditableName value={v.teamNames[ti]} label={t.teamName} onSave={(name) => send({ type: "teamName", team: ti, name })} />
                  <AiNameButton label={`${t.teamName}: ${t.aiName}`} disabled={busy} make={() => funnyName("team", s.lang, v.teamNames, t.funnyTeams, aiRoom)} onName={(name) => send({ type: "teamName", team: ti, name })} />
                </span>
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
                      <button onClick={() => send({ type: "kick", player: i })} disabled={busy} aria-label={t.removePlayer(p.name)} className={mini}>
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
          <input value={adding} onChange={(e) => setAdding(e.target.value)} maxLength={24} placeholder={t.addPlayer} aria-label={t.addPlayer} className={`${field} min-w-0 flex-1 py-2.5 font-semibold`} />
          <AiNameButton
            label={t.aiName}
            make={() => funnyName("player", s.lang, v.players.map((p) => p.name), t.funnyPlayers, aiRoom, adding, t.namePrefixes)}
            onName={setAdding}
            className={`grid size-[3.2rem] shrink-0 place-items-center rounded-2xl border border-line bg-surface text-accent ${press}`}
          />
          <button disabled={busy || !adding.trim() || v.players.length >= 20} aria-label="+" className={`${btn2} w-auto! shrink-0 px-4`}>
            <UserPlus className="size-5" aria-hidden />
          </button>
        </form>
      ) : null}
      <div className="-mt-1 flex gap-2">
        {!local && (
          <button onClick={() => send({ type: "team", team: (1 - mine) as Team })} disabled={busy} className={`${btn2} min-w-0`}>
            <ArrowLeftRight className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t.switchTo(v.teamNames[1 - mine])}</span>
          </button>
        )}
        {v.isHost && (
          <button onClick={() => send({ type: "shuffle" })} disabled={busy} className={`${btn2} ${local ? "" : "w-auto! shrink-0"}`}>
            <Shuffle className="size-4 shrink-0" aria-hidden /> {t.shuffle}
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
            <h3 className="mt-4 font-semibold">{t.wordLang}</h3>
            <p className="text-sm text-muted">{t.wordLangHelp}</p>
            <div className="mt-2">
              <Segmented options={LANGS.map((l) => ({ id: l.id, label: l.label }))} value={s.lang} onChange={(lang) => set({ lang })} />
            </div>
            <h3 className="mt-4 font-semibold">{t.rounds}</h3>
            <p className="text-sm text-muted">{t.roundsHelp}</p>
            <DragDropProvider onDragEnd={(e) => { if (!e.canceled) set({ rounds: moved(s.rounds, e) }); }}>
            <ol className="mt-3 flex flex-col gap-2">
              {s.rounds.map((r, i) => (
                <RoundRow key={r} r={r} i={i}>
                  <button onClick={() => set({ rounds: s.rounds.filter((x) => x !== r) })} disabled={s.rounds.length === 1} aria-label={t.drop(t.round[r].name)} className={mini}>
                    <X className="size-4" aria-hidden />
                  </button>
                </RoundRow>
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
            </DragDropProvider>
          </>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-muted">
            <li>{t.sumPerPlayer(s.perPlayer)}</li>
            <li>{t.sumSeconds(s.seconds)}</li>
            <li>{t.sumSkips(s.skips)}</li>
            <li>{t.sumLang(LANGS.find((l) => l.id === s.lang)!.label)}</li>
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

type Check = { corrected: string; tooHard: boolean; reason: string; hint: string };
const CHECK_DELAY = 700; // ms of calm typing before a word is checked

export function Write({ v, send, busy }: P) {
  const t = useT();
  const lang = v.settings.lang; // the Zetteli's language, set by the host; the UI stays in this phone's language
  const aiOn = useAiOn(); // switched on here, and signed in (or in a signed-in host's room) where that's required
  const aiRoom = useAiRoom();
  const n = v.settings.perPlayer;
  // kept Zetteli stay filled; cancelled duplicates leave an empty slip to rewrite
  const [draft, setDraft] = useState<SlipT[]>(() => {
    const kept = v.myWrite?.words ?? [];
    return Array.from({ length: n }, (_, i) => kept[i] ?? { word: "", hint: "" });
  });
  // AI results by word, filled in the background; the form never waits for them
  const [checks, setChecks] = useState<Record<string, Check | "loading">>({});
  const typedHint = useRef<boolean[]>(draft.map((d) => !!d.hint)); // a hint the writer typed is never overwritten
  const edit = (i: number, patch: Partial<SlipT>) => {
    if (patch.hint !== undefined) typedHint.current[i] = !!patch.hint.trim();
    setDraft((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };
  const dupes = new Set(draft.map((d) => norm(d.word)).filter((w, i, all) => w && all.indexOf(w) !== i));

  // "In die Schüssel": a bowl takes the button's place, the slips fold and fly into it, then we send
  const [tossing, setTossing] = useState(false);
  const [paths, setPaths] = useState<{ dx: number; dy: number }[] | null>(null);
  const slipEls = useRef<(HTMLDivElement | null)[]>([]);
  const bowlEl = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!tossing || !bowlEl.current) return;
    const b = bowlEl.current.getBoundingClientRect();
    setPaths(
      slipEls.current.map((el) => {
        const r = el?.getBoundingClientRect();
        return r ? { dx: b.left + b.width / 2 - (r.left + r.width / 2), dy: b.top + b.height * 0.35 - (r.top + r.height / 2) } : { dx: 0, dy: 300 };
      }),
    );
  }, [tossing]);
  const [caught, setCaught] = useState(0);
  const submit = async () => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return send({ type: "words", words: draft });
    setTossing(true);
    const flight = 700 + (draft.length - 1) * 110;
    draft.forEach((_, i) => setTimeout(() => setCaught((n) => n + 1), 650 + i * 110)); // the bowl bounces as each one lands
    await new Promise((r) => setTimeout(r, flight + 150));
    await send({ type: "words", words: draft });
    setTossing(false);
    setPaths(null);
  };

  const words = draft.map((d) => d.word.trim());
  useEffect(() => {
    const todo = aiOn ? [...new Set(words.filter((w) => w.length >= 2 && !(w in checks)))] : [];
    if (!todo.length) return;
    const timer = setTimeout(async () => {
      setChecks((c) => ({ ...c, ...Object.fromEntries(todo.map((w) => [w, "loading" as const])) }));
      let results: Check[] | null = null;
      try {
        const r = await fetch("/api/ai/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ words: todo, lang, room: aiRoom }) }).then((x) => x.json());
        if (r?.ai && Array.isArray(r.results) && r.results.length === todo.length) results = r.results;
      } catch {}
      const none: Check = { corrected: "", tooHard: false, reason: "", hint: "" };
      setChecks((c) => ({ ...c, ...Object.fromEntries(todo.map((w, i) => [w, results?.[i] ?? none])) }));
      // hints go straight onto the slips, unless the writer already typed one
      if (results)
        setDraft((d) =>
          d.map((x, i) => {
            const k = todo.indexOf(x.word.trim());
            return k >= 0 && !typedHint.current[i] && results[k].hint ? { ...x, hint: results[k].hint } : x;
          }),
        );
    }, CHECK_DELAY);
    return () => clearTimeout(timer);
  }, [words.join("\u0000"), lang, aiOn]); // eslint-disable-line react-hooks/exhaustive-deps -- re-run only when the words change

  if (v.iDone)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="relative h-40 w-48">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="fall mini-slip absolute top-6 h-8 w-12"
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
        if (!tossing) submit();
      }}
      className="enter flex flex-1 flex-col gap-5"
    >
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight">{t.writeTitle(draft.length)}</h2>
        <p className="mt-1 text-muted">{t.writeHelp}</p>
      </div>
      {aiOn && (
        <Ideas
          lang={lang}
          avoid={words.filter(Boolean)}
          full={draft.every((d) => d.word.trim())}
          onPick={(w) => {
            const i = draft.findIndex((d) => !d.word.trim());
            if (i >= 0) edit(i, { word: w }); // never over a word the player wrote
          }}
        />
      )}
      {v.myWrite?.cancelled.map((w) => (
        <p key={w} role="alert" className="pop flex items-start gap-2 rounded-2xl bg-raised px-4 py-3 font-medium">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-hi" aria-hidden /> {t.cancelled(w)}
        </p>
      ))}
      {/* few Zetteli: each one grows into the free space; many: comfortable fixed size */}
      <div className="flex flex-1 flex-col gap-5">
        {draft.map((d, i) => {
          const c = checks[d.word.trim()];
          const r = c && c !== "loading" ? c : null;
          const fix = r?.corrected && r.corrected !== d.word.trim() ? r.corrected : "";
          return (
            <div
              key={i}
              ref={(el) => {
                slipEls.current[i] = el;
              }}
              className={`${draft.length <= 3 ? "flex max-h-72 min-h-40 flex-1 flex-col" : ""} ${paths ? "into-bowl pointer-events-none" : ""}`}
              style={paths?.[i] ? ({ "--dx": `${paths[i].dx}px`, "--dy": `${paths[i].dy}px`, "--spin": `${i % 2 ? -30 : 25}deg`, animationDelay: `${i * 110}ms` } as CSSProperties) : undefined}
            >
              <Slip
                tilt={i % 2 ? 1.2 : -1.2}
                className={`unfold relative @container flex flex-col justify-center px-5 pt-5 pb-8 focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-accent ${draft.length <= 3 ? "flex-1" : ""}`}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <input
                  autoComplete="off"
                  maxLength={40}
                  value={d.word}
                  aria-label={t.slip(i + 1)}
                  placeholder={t.slip(i + 1)}
                  onChange={(e) => edit(i, { word: e.target.value })}
                  className="font-hand w-full bg-transparent pr-7 leading-tight font-bold outline-none placeholder:text-paper-ink/30"
                  style={fitLine(d.word || t.slip(i + 1), "3rem")}
                />
                {c === "loading" && <Loader2 className="absolute top-4 right-3 size-4 animate-spin text-paper-ink/40" aria-label={t.checking} />}
                <input
                  autoComplete="off"
                  maxLength={80}
                  value={d.hint}
                  aria-label={`${t.slip(i + 1)}: ${t.hintPh}`}
                  placeholder={t.hintPh}
                  onChange={(e) => edit(i, { hint: e.target.value })}
                  className="mt-2 w-full bg-transparent pb-1 text-base text-paper-ink/70 outline-none placeholder:text-paper-ink/30"
                />
              </Slip>
              {dupes.has(norm(d.word)) && <p className="mt-2 text-sm font-medium text-hi">{t.twice(d.word)}</p>}
              {(fix || r?.tooHard) && (
                <div aria-live="polite" className="pop mt-2 flex flex-wrap items-center gap-2 text-sm">
                  {fix && (
                    <button type="button" onClick={() => edit(i, { word: fix })} className={`flex items-center gap-1.5 rounded-2xl bg-raised px-3 py-1.5 text-left font-semibold ${press}`}>
                      <Sparkles className="size-4 text-accent" aria-hidden /> {t.didYouMean(fix)} <span className="text-accent">{t.useIt}</span>
                    </button>
                  )}
                  {r?.tooHard && (
                    <span className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-muted">
                      <AlertTriangle className="size-4 shrink-0 text-hi" aria-hidden /> {r.reason || t.tooHard}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Cta>
        {tossing ? (
          <div className="flex justify-center">
            <div ref={bowlEl} className="pop w-32">
              <div key={caught} className={caught ? "catch" : ""}>
                <Bowl />
              </div>
            </div>
          </div>
        ) : (
          <button disabled={busy || draft.some((d) => !norm(d.word)) || dupes.size > 0} className={btn}>
            {t.intoBowl}
          </button>
        )}
        <p className="mt-2 text-center text-sm text-muted tabular-nums">{t.done(v.done, v.players.length)}</p>
      </Cta>
    </form>
  );
}

/** topic in, three AI suggestions out; tapping one puts it on the next empty Zetteli */
function Ideas({ lang, avoid, full, onPick }: { lang: string; avoid: string[]; full: boolean; onPick: (w: string) => void }) {
  const t = useT();
  const aiRoom = useAiRoom();
  const [topic, setTopic] = useState("");
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const get = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/ai/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, lang, avoid, room: aiRoom }) }).then((x) => x.json());
      setIdeas(r?.ai && Array.isArray(r.words) && r.words.length ? r.words : []);
    } catch {
      setIdeas([]);
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="rounded-3xl bg-surface p-3" aria-label={t.ideas}>
      <div className="flex gap-2">
        <input
          value={topic}
          maxLength={60}
          autoComplete="off"
          aria-label={t.topicPh}
          placeholder={t.topicPh}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // not the Zetteli form
              get();
            }
          }}
          className="min-w-0 flex-1 rounded-2xl bg-canvas px-3 py-2.5 outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button type="button" onClick={get} disabled={loading} aria-label={t.getIdeas} className={`${btn2} w-auto! shrink-0 px-3 text-accent`}>
          {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Sparkles className="size-5" aria-hidden />}
        </button>
      </div>
      {ideas && ideas.length === 0 && <p className="mt-2 px-1 text-sm text-muted">{t.noIdeas}</p>}
      {ideas && ideas.length > 0 && (
        <div aria-live="polite" className="mt-3 flex flex-wrap gap-2">
          {ideas.map((w, i) => (
            <button key={w} type="button" disabled={full} onClick={() => { onPick(w); setIdeas((xs) => xs && xs.filter((x) => x !== w)); }} aria-label={t.pickIdea(w)} className={`${press} disabled:opacity-50`}>
              <Slip tilt={i % 2 ? 2 : -2} className="pop px-3 pt-1 pb-1">
                <span className="font-hand text-2xl font-bold">{w}</span>
              </Slip>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** one-phone games: hand the phone over before anything secret shows */
export function PassPhone({ name, team, teamName, onReady, note }: { name: string; team: Team; teamName: string; onReady: () => void; note?: string }) {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <span className={`pop grid size-24 place-items-center rounded-4xl ${TEAM[team].soft}`}>
          <Smartphone className={`size-12 ${TEAM[team].text}`} strokeWidth={1.75} aria-hidden />
        </span>
        <p className="enter mt-2 text-lg text-muted">{t.passTo}</p>
        <h1 className={`enter text-6xl font-extrabold tracking-tight text-balance break-words ${TEAM[team].text}`}>{name}</h1>
        <p className="enter text-muted">{teamName}</p>
        {note && <p className="enter mt-4 max-w-[30ch] text-muted">{note}</p>}
      </div>
      <Cta>
        <button onClick={onReady} className={btn}>
          {t.iAm(name)}
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
      <RoundCard v={v} n={v.round} mode={mode} className="enter" />
      {last && (
        <p aria-live="polite" className="pop self-center rounded-full bg-surface px-4 py-2 text-center">
          {t.gotLast(v.players[last.p].name, last.got)}
        </p>
      )}
      <div className="enter flex flex-1 flex-col items-center justify-center gap-2 text-center [animation-delay:120ms]">
        <Bowl count={v.bowlLeft} className="w-28" />
        <p className="mt-3 text-muted">{local ? t.passTo : me ? t.yourTurn : t.upNext}</p>
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

function SwipeSlip({ text, hint, locked, canSkip, fling, onSwipe }: { text: string; hint: string; locked: boolean; canSkip: boolean; fling: "r" | "l" | null; onSwipe: (d: "r" | "l") => void }) {
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
      </div>
      {locked && (
        <p role="alert" className="pop absolute inset-x-0 top-1/2 mx-auto w-max -translate-y-1/2 -rotate-6 rounded-xl bg-cta px-5 py-2 text-3xl font-extrabold text-cta-ink shadow-xl">{t.timeUp}</p>
      )}
    </div>
  );
}

export function Turn({ v, left, send, live, mode }: P & { left: number }) {
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
        {topBar}
        {word && (
          <Slip key={word.id} tilt={-1} className="unfold @container w-full max-w-xs self-center px-5 pt-1.5 text-center">
            <span data-testid="word" className="font-hand block font-bold" style={fitLine(word.text, "2.25rem")}>
              {word.text}
            </span>
            {showHint && word.hint && <span className="block text-center text-sm text-paper-ink/60">{word.hint}</span>}
          </Slip>
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
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* always visible: time, score this turn, bowl */}
      {topBar}
      <div className="flex items-start gap-2 rounded-2xl bg-surface px-3 py-2 text-sm text-muted">
        <RoundIcon type={type} className="mt-0.5 size-4 shrink-0 text-accent" />
        <p className="[@media(max-height:700px)]:line-clamp-2">
          <b className="text-ink">{t.round[type].name}:</b> {ruleOf(t, type, mode)}
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center">
        {v.word && <SwipeSlip key={v.word.id} text={v.word.text} hint={v.word.hint} locked={up} canSkip={v.canSkip} fling={fling} onSwipe={act} />}
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

// ---------- round over ----------

export function RoundEnd({ v, send, busy, mode }: P) {
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
      <RoundCard v={v} n={v.round + 1} mode={mode} className="enter [animation-delay:200ms]" />
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

/** a guessed Zetteli flashes on every phone except the one that scored it */
function GotFlash({ v }: { v: View }) {
  const t = useT();
  const g = v.lastGot;
  const [seen, setSeen] = useState(g?.n ?? 0); // no flash for what was guessed before this screen opened
  const [shown, setShown] = useState<typeof g>(null);
  if (g && g.n !== seen) {
    setSeen(g.n);
    if (g.by !== v.me) setShown(g);
  }
  useEffect(() => {
    if (!shown) return;
    buzz(15);
    const h = setTimeout(() => setShown(null), 1800);
    return () => clearTimeout(h);
  }, [shown]);
  if (!shown) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))] z-40 flex justify-center px-4">
      <p key={shown.n} className="pop flex max-w-full items-center gap-2 rounded-full bg-cta px-4 py-2 font-bold text-cta-ink shadow-xl">
        <Check className="size-5 shrink-0" aria-hidden />
        <span className="truncate">
          {t.got}: <span className="font-hand text-2xl leading-none">{shown.text}</span>
        </span>
      </p>
    </div>
  );
}

/** every phase of a running game; lobby and joining are handled by the page */
export function Phase(props: P & { left: number }) {
  const { v } = props;
  const body =
    v.phase === "write" ? <Write key={`w${v.settings.perPlayer}-${v.me}-${v.myWrite?.cancelled.length ?? 0}`} {...props} />
    : v.phase === "ready" ? <Ready key={`r${v.turnNo}-${v.round}`} {...props} />
    : v.phase === "turn" ? <Turn key={`t${v.turnNo}`} {...props} />
    : v.phase === "roundEnd" ? <RoundEnd {...props} />
    : v.phase === "end" ? <End {...props} />
    : null;
  return (
    <>
      {props.mode === "online" && v.phase !== "write" && <GotFlash v={v} />}
      {body}
    </>
  );
}
