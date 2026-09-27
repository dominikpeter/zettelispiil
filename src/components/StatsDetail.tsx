"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, Flame, Lightbulb, PenLine, SkipForward, Snail, Trophy, X, Zap, type LucideIcon } from "lucide-react";
import type { View } from "@/lib/room";
import type { Dict } from "@/lib/i18n";
import { awards, playerDetail, wordDetail, type Award, type Stats } from "@/lib/stats";
import { openSheet, round_btn, RoundIcon, Slip, TEAM, press } from "@/lib/ui";

export const CHART = ["var(--color-chart-a)", "var(--color-chart-b)", "var(--color-chart-c)", "var(--color-chart-d)"]; // one per team
export const fmt = (ms: number) => (ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: ms < 10_000 ? 1 : 0 });

/** what the drill-down sheet shows; the sheet keeps a stack of them, so a word opened from a player leads back to the player */
export type Focus = { kind: "player"; p: number } | { kind: "word"; w: number };

/** everything the end-screen pieces need, passed around as one */
export type Ctx = {
  v: View;
  st: NonNullable<View["stats"]>;
  s: Stats;
  names: string[]; // round names
  t: Dict;
  showMe: boolean;
  open: (f: Focus) => void;
};

export const authorName = (c: Ctx, i: number) => (i < 0 ? c.t.aiAuthor : (c.v.players[i]?.name ?? "?")); // -1: the AI wrote it

/** a player's name as a coloured pill; tap for their story */
export function PlayerChip({ c, p }: { c: Ctx; p: number }) {
  const team = c.v.players[p]?.team ?? 0;
  return (
    <button onClick={() => c.open({ kind: "player", p })} className={`inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ${TEAM[team].soft} ${TEAM[team].text} ${press}`}>
      <span className="truncate">{c.v.players[p]?.name ?? "?"}</span>
    </button>
  );
}

/** a Zetteli as a little paper chip, with its seconds; tap for its story */
function WordChip({ c, w, ms, icon: Icon, iconLabel }: { c: Ctx; w: number; ms?: number; icon?: LucideIcon; iconLabel?: string }) {
  return (
    <button onClick={() => c.open({ kind: "word", w })} className={`flex max-w-full items-baseline gap-1.5 rounded-xl bg-raised px-2.5 py-1 text-left ${press}`}>
      {Icon && (
        <span className="self-center" title={iconLabel}>
          <Icon className="size-3.5 text-accent" aria-hidden />
          <span className="sr-only">{iconLabel}</span>
        </span>
      )}
      <span className="font-hand min-w-0 truncate pr-1 text-lg leading-tight font-bold">{c.st.words[w]}</span>
      {ms !== undefined && <span className="shrink-0 text-xs text-muted tabular-nums">{fmt(ms)} s</span>}
    </button>
  );
}

function Tiles({ items }: { items: { value: string; label: string }[] }) {
  return (
    <dl className={`grid gap-2 ${items.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {items.map((x) => (
        <div key={x.label} className="flex min-w-0 flex-col-reverse justify-end rounded-2xl bg-raised px-3 py-2">
          <dt className="text-xs leading-tight text-muted">{x.label}</dt>
          <dd className="text-2xl font-extrabold tabular-nums">{x.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** one player's game: tempo, every Zetteli they got guessed round by round, their best turn, and the Zetteli they wrote */
function PlayerStory({ c, p }: { c: Ctx; p: number }) {
  const { v, st, s, names, t } = c;
  const d = playerDetail(st.log, st.turns, p, names.length, st.authors);
  const team = v.players[p]?.team ?? 0;
  const rank = s.players.findIndex((x) => x.p === p) + 1;
  const heckled = st.heckles.filter((h) => h.by === p).length;
  const maxGot = Math.max(1, ...d.rounds.map((r) => r.got));
  const maxWrote = Math.max(1, ...s.hardest.map((h) => h.ms));
  return (
    <>
      <p className="-mt-2 text-muted">
        <span className={`font-semibold ${TEAM[team].text}`}>{v.teamNames[team]}</span>
        {`, ${t.rankOf(rank, v.players.length)}`}
        {heckled > 0 && `, ${t.heckledN(heckled)}`}
      </p>
      <Tiles
        items={[
          { value: String(d.got), label: t.tileGuessed },
          { value: d.avgMs ? fmt(d.avgMs) : "–", label: t.tileSecPer },
          { value: String(d.skips), label: t.tileSkips },
          { value: String(d.turns), label: t.tileTurns },
        ]}
      />
      {d.bestTurn && d.bestTurn.got > 0 && (
        <p className="flex items-center gap-2 rounded-2xl bg-raised px-3 py-2 text-sm">
          <Flame className="size-4 shrink-0 text-accent" aria-hidden />
          <span>
            <span className="font-semibold">{t.awardTurn}: </span>
            {t.inOneTurn(d.bestTurn.got, names[d.bestTurn.r])}
          </span>
        </p>
      )}
      <section>
        <h3 className="font-semibold">{t.explained}</h3>
        <p className="text-sm text-muted">{t.explainedNote}</p>
        <ul className="mt-3 flex flex-col gap-4">
          {d.rounds.map((r) => (
            <li key={r.r}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <RoundIcon type={v.settings.rounds[r.r]} className="size-4 shrink-0 text-accent" />
                <span className="font-semibold">{names[r.r]}</span>
                <span className="ml-auto min-w-0 text-sm text-muted tabular-nums">{[t.slipsN(r.got), r.avgMs ? t.perSlip(fmt(r.avgMs)) : null].filter(Boolean).join(", ")}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-raised">
                <div className="growx h-full rounded-full" style={{ width: `${(r.got / maxGot) * 100}%`, background: CHART[team] }} />
              </div>
              {r.words.length ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {r.words.map((x) => (
                    <li key={x.w} className="max-w-full">
                      <WordChip
                        c={c}
                        w={x.w}
                        ms={x.ms}
                        icon={d.fastest && x.w === d.fastest.w && r.r === d.fastest.r ? Zap : d.slowest && x.w === d.slowest.w && r.r === d.slowest.r ? Snail : undefined}
                        iconLabel={d.fastest && x.w === d.fastest.w && r.r === d.fastest.r ? t.fastest : t.slowest}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-sm text-muted">{t.nothingGuessed}</p>
              )}
              {r.skips > 0 && <p className="mt-1 text-sm text-muted">{t.skippedN(r.skips)}</p>}
            </li>
          ))}
        </ul>
      </section>
      {d.wrote.length > 0 && (
        <section>
          <h3 className="font-semibold">{t.wrote}</h3>
          <p className="text-sm text-muted">{t.wroteNote}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {d.wrote.map((x) => (
              <li key={x.w}>
                <button onClick={() => c.open({ kind: "word", w: x.w })} className={`flex w-full flex-col gap-1 rounded-xl text-left ${press}`}>
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="font-hand min-w-0 truncate pr-1.5 text-xl leading-tight font-bold">{st.words[x.w]}</span>
                    <span className="shrink-0 text-sm text-muted tabular-nums">{[`${fmt(x.ms)} s`, x.skips ? t.skippedN(x.skips) : null].filter(Boolean).join(", ")}</span>
                  </span>
                  <span className="block h-1.5 w-full rounded-full bg-raised">
                    <span className="growx block h-full rounded-full bg-chart-b" style={{ width: `${(x.ms / maxWrote) * 100}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** one Zetteli's story: who wrote it, its hint, and round by round who described it, how long it took, who skipped it */
function WordStory({ c, w }: { c: Ctx; w: number }) {
  const { v, st, s, names, t } = c;
  const d = wordDetail(st.log, w, names.length);
  const a = st.authors[w] ?? -1;
  const hint = st.hints?.[w];
  const maxMs = Math.max(1, ...d.map((r) => r.ms));
  return (
    <>
      <div className="-mt-2 flex flex-wrap items-center gap-2 text-muted">
        {t.by("")}
        {a >= 0 ? <PlayerChip c={c} p={a} /> : <span className="font-semibold text-ink">{t.aiAuthor}</span>}
      </div>
      {hint && (
        <p className="flex items-start gap-2 rounded-2xl bg-raised px-3 py-2 text-sm">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <span>
            <span className="font-semibold">{t.hint}: </span>
            {hint}
          </span>
        </p>
      )}
      <Tiles
        items={[
          { value: fmt(d.reduce((n, r) => n + r.ms, 0)), label: t.tileTotal },
          { value: String(d.reduce((n, r) => n + r.skips, 0)), label: t.tileSkips },
          { value: `#${s.hardRank[w] ?? "–"}`, label: t.tileRank(st.words.length) },
        ]}
      />
      <section>
        <h3 className="font-semibold">{t.story}</h3>
        <ol className="mt-3 flex flex-col gap-4">
          {d.map((r) => (
            <li key={r.r}>
              <div className="flex items-center gap-2">
                <RoundIcon type={v.settings.rounds[r.r]} className="size-4 shrink-0 text-accent" />
                <span className="font-semibold">{names[r.r]}</span>
                <span className="ml-auto shrink-0 text-sm text-muted tabular-nums">{r.ms ? `${fmt(r.ms)} s` : "–"}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-raised">
                <div className="growx h-full rounded-full bg-chart-b" style={{ width: `${(r.ms / maxMs) * 100}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
                {r.by === null ? (
                  t.notGuessed
                ) : (
                  <>
                    {t.describedBy("")}
                    <PlayerChip c={c} p={r.by} />
                  </>
                )}
              </div>
              {r.skippedBy.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
                  {t.skippedBy("")}
                  {r.skippedBy.map((p) => (
                    <PlayerChip key={p} c={c} p={p} />
                  ))}
                  {r.skips > r.skippedBy.length && <span className="tabular-nums">({t.skippedN(r.skips)})</span>}
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

/** the drill-down: a bottom sheet with a player's or a Zetteli's story; links inside open the next one, back goes back */
export function StorySheet({ c, stack, onBack, onClose }: { c: Ctx; stack: Focus[]; onBack: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const top = stack.at(-1);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (top) openSheet(d);
    if (!top && d.open) d.close();
    d.scrollTop = 0; // every new story starts at its top
  }, [top]);
  const t = c.t;
  const title = !top ? "" : top.kind === "player" ? (c.v.players[top.p]?.name ?? "?") : (c.st.words[top.w] ?? "?");
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current.close()} // tap outside closes
      aria-label={title}
      className="sheet mx-auto mt-auto mb-0 max-h-detail-sheet w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-surface p-0 text-ink backdrop:bg-black/60 sm:mb-auto sm:rounded-3xl"
    >
      {top && (
        <div key={stack.length} className="enter flex flex-col gap-4 p-5 pb-safe-5">
          <div className="flex items-start gap-2">
            {stack.length > 1 && (
              <button onClick={onBack} aria-label={t.back} className={`${round_btn} shrink-0`}>
                <ChevronLeft className="size-6" aria-hidden />
              </button>
            )}
            <div className="min-w-0 flex-1 pt-1">
              {top.kind === "word" ? (
                <Slip tilt={-1.5} className="inline-block max-w-full px-4 pt-2">
                  <h2 className="font-hand text-3xl leading-tight font-bold break-words">{title}</h2>
                </Slip>
              ) : (
                <h2 className="text-3xl leading-tight font-extrabold break-words">
                  {title}
                  {c.showMe && top.p === c.v.me && <span className="text-xl font-semibold text-muted"> ({t.you})</span>}
                </h2>
              )}
            </div>
            <button onClick={() => dialog.current?.close()} aria-label={t.close} className={`${round_btn} shrink-0`}>
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {top.kind === "player" ? <PlayerStory c={c} p={top.p} /> : <WordStory c={c} w={top.w} />}
        </div>
      )}
    </dialog>
  );
}

const AWARD: Record<Award["kind"], { icon: LucideIcon; label: (t: Dict) => string }> = {
  top: { icon: Trophy, label: (t) => t.awardTop },
  quick: { icon: Zap, label: (t) => t.awardQuick },
  turn: { icon: Flame, label: (t) => t.awardTurn },
  skips: { icon: SkipForward, label: (t) => t.awardSkips },
  writer: { icon: PenLine, label: (t) => t.awardWriter },
};

/** trophies for the people who made the game: most explained, quickest, best turn, most skips, trickiest Zetteli */
export function Awards({ c }: { c: Ctx }) {
  const { v, st, names, t } = c;
  const list = awards(st.log, st.turns, st.authors, v.players.length);
  if (!list.length) return null;
  const detail = (a: Award) =>
    a.kind === "top" ? t.slipsN(a.got) : a.kind === "quick" ? t.perSlip(fmt(a.ms)) : a.kind === "turn" ? t.inOneTurn(a.got, names[a.r]) : a.kind === "skips" ? t.skippedN(a.n) : t.avgToGuess(fmt(a.ms));
  return (
    <section className="enter rounded-3xl bg-surface p-5">
      <h2 className="text-lg font-bold">{t.awards}</h2>
      <p className="mt-0.5 text-sm text-muted">{t.awardsNote}</p>
      <ul className="mt-4 grid grid-cols-2 gap-3">
        {list.map((a, i) => {
          const { icon: Icon, label } = AWARD[a.kind];
          const team = v.players[a.p]?.team ?? 0;
          const hero = i === 0 && a.kind === "top"; // the MVP gets the full width
          return (
            <li key={a.kind} className={`enter ${hero ? "col-span-2" : ""}`} style={{ animationDelay: `${0.1 + i * 0.07}s` }}>
              <button onClick={() => c.open({ kind: "player", p: a.p })} className={`flex h-full w-full rounded-2xl bg-raised p-3 text-left ${hero ? "items-center gap-3" : "flex-col items-start gap-1.5"} ${press}`}>
                <span className={`grid shrink-0 place-items-center rounded-full ${TEAM[team].soft} ${TEAM[team].text} ${hero ? "size-12" : "size-9"}`}>
                  <Icon className={hero ? "size-6" : "size-5"} aria-hidden />
                </span>
                <span className="flex w-full min-w-0 flex-col">
                  <span className="text-xs leading-tight text-muted">{label(t)}</span>
                  <span className={`truncate font-extrabold ${TEAM[team].text} ${hero ? "text-2xl" : "text-lg"}`}>{v.players[a.p]?.name ?? "?"}</span>
                  <span className="text-xs text-muted tabular-nums">{detail(a)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
