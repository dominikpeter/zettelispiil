"use client";

import { useState } from "react";
import type { RoundType, View } from "@/lib/room";
import type { Dict } from "@/lib/i18n";
import { useT } from "@/lib/prefs";
import { ChevronDown } from "lucide-react";
import { computeStats, playerDetail, wordDetail } from "@/lib/stats";
import { Confetti, RoundIcon, Slip, TEAM, press } from "@/lib/ui";
import { Drawings } from "./Drawings";

const fmt = (ms: number) => (ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: ms < 10_000 ? 1 : 0 });
const CHART = ["var(--color-chart-a)", "var(--color-chart-b)", "var(--color-chart-c)", "var(--color-chart-d)"]; // one per team
const W = 340;
// tappable row that expands in place; the chevron flips when open
const expand = "group [&[open]>summary>svg]:rotate-180";
const summary = `cursor-pointer list-none items-center gap-2 rounded-xl [&::-webkit-details-marker]:hidden ${press}`;
const chevron = <ChevronDown className="size-4 shrink-0 text-muted transition-transform" aria-hidden />;

/** a row that expands in place; its details are only worked out once someone opens it */
function More({ className = "", head, headClass, label, body }: { className?: string; head: React.ReactNode; headClass: string; label?: string; body: () => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details className={`${expand} ${className}`} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={`${summary} ${headClass}`} aria-label={label}>
        {head}
      </summary>
      {open && body()}
    </details>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="enter rounded-3xl bg-surface p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {note && <p className="mt-0.5 text-sm text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Legend({ names }: { names: string[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      {names.map((n, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: CHART[i] }} />
          {n}
        </span>
      ))}
    </div>
  );
}

/** cumulative score after each turn; tap or drag to read any turn */
function Race({ race, turns, players, names, teams, t }: { race: number[][]; turns: NonNullable<View["stats"]>["turns"]; players: View["players"]; names: string[]; teams: string[]; t: Dict }) {
  const H = 170;
  const pad = { l: 8, r: 64, t: 10, b: 22 };
  const max = Math.max(1, ...race.flat());
  const x = (i: number) => pad.l + (i / Math.max(1, race.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const [hover, setHover] = useState<number | null>(null);
  const path = (t: number) => race.map((p, i) => `${i ? `H${x(i)}V` : `M${x(0)} `}${y(p[t])}`).join("");
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (race.length - 1));
    setHover(Math.max(1, Math.min(race.length - 1, i)));
  };
  const h = hover !== null ? turns[hover - 1] : null;
  const end = race.at(-1)!;
  const all = end.map((_, i) => i);
  // keep the end labels from overlapping: top to bottom, each at least 16 px below the one above, then centred on the points again
  const ly = end.map((e) => y(e));
  const order = [...all].sort((a, b) => ly[a] - ly[b] || end[b] - end[a]);
  const want = order.map((i) => ly[i]);
  const placed = [...want];
  for (let k = 1; k < placed.length; k++) placed[k] = Math.max(placed[k], placed[k - 1] + 16);
  const shift = (want.reduce((a, v) => a + v, 0) - placed.reduce((a, v) => a + v, 0)) / placed.length;
  order.forEach((i, k) => (ly[i] = Math.max(pad.t, placed[k] + shift)));

  return (
    <div className="relative">
      <Legend names={teams} />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={t.raceLabel(race.length - 1)}
      >
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--color-line)" strokeDasharray="2 4" />
            <text x={pad.l} y={y(max * f) - 4} className="fill-muted text-[10px]">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--color-line)" />
        {all.map((t) => (
          <path key={t} d={path(t)} fill="none" stroke={CHART[t]} strokeWidth="2.5" strokeLinejoin="round" className="draw" pathLength={1} style={{ "--len": 1 } as React.CSSProperties} />
        ))}
        {all.map((t) => (
          <g key={`e${t}`}>
            <circle cx={x(race.length - 1)} cy={y(end[t])} r="4.5" fill={CHART[t]} stroke="var(--color-surface)" strokeWidth="2" />
            <text x={x(race.length - 1) + 9} y={ly[t] + 4} className="fill-ink text-xs font-bold">
              {end[t]}
            </text>
          </g>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} stroke="var(--color-muted)" strokeWidth="1" />
            {all.map((t) => (
              <circle key={t} cx={x(hover)} cy={y(race[hover][t])} r="5" fill={CHART[t]} stroke="var(--color-surface)" strokeWidth="2" />
            ))}
          </g>
        )}
        <text x={pad.l} y={H - 4} className="fill-muted text-[10px]">
          Start
        </text>
        <text x={W - pad.r} y={H - 4} textAnchor="end" className="fill-muted text-[10px]">
          {t.turnN(race.length - 1)}
        </text>
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-6 rounded-xl bg-raised px-3 py-2 text-sm shadow-lg"
          style={{ left: `${Math.min(62, Math.max(0, (x(hover) / W) * 100 - 18))}%` }}
        >
          <div className="font-bold">
            {t.turnN(hover)}: {players[h.p].name}
          </div>
          <div className="text-muted">
            +{h.got} {t.inRound(names[h.r])}
          </div>
          <div className="mt-1 tabular-nums">
            {race[hover].join(" : ")}
          </div>
        </div>
      )}
    </div>
  );
}

function RoundBars({ scores, names, teams, t }: { scores: number[][]; names: string[]; teams: string[]; t: Dict }) {
  const H = 150;
  const max = Math.max(1, ...scores.flat());
  const gw = W / scores.length;
  const n = scores[0]?.length ?? 2; // teams
  const bw = Math.min(34, (gw * 2) / (3 * n)); // two teams: a third of the group each, like before
  return (
    <>
      <Legend names={teams} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t.perRound}>
        <line x1="0" x2={W} y1={H - 26} y2={H - 26} stroke="var(--color-line)" />
        {scores.map((s, r) => (
          <g key={r}>
            {s.map((v, t) => {
              const h = (v / max) * (H - 50);
              const bx = gw * r + gw / 2 - (n * bw + (n - 1) * 2) / 2 + t * (bw + 2);
              return (
                <g key={t}>
                  <rect x={bx} y={H - 26 - h} width={bw} height={h} rx="4" fill={CHART[t]} className="grow" style={{ animationDelay: `${r * 0.08 + t * 0.04}s` }}>
                    <title>{`${teams[t]}, ${names[r]}: ${v}`}</title>
                  </rect>
                  <text x={bx + bw / 2} y={H - 32 - h} textAnchor="middle" className="fill-ink text-xs font-bold tabular-nums">
                    {v}
                  </text>
                </g>
              );
            })}
            <text x={gw * r + gw / 2} y={H - 8} textAnchor="middle" className="fill-muted text-[11px]">
              {names[r]}
            </text>
          </g>
        ))}
      </svg>
    </>
  );
}

function Tempo({ rounds, names, label }: { rounds: { avgMs: number }[]; names: string[]; label: string }) {
  const H = 130;
  const max = Math.max(1, ...rounds.map((r) => r.avgMs));
  const gw = W / rounds.length;
  const bw = Math.min(46, gw * 0.5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
      <line x1="0" x2={W} y1={H - 26} y2={H - 26} stroke="var(--color-line)" />
      {rounds.map((r, i) => {
        const h = (r.avgMs / max) * (H - 50);
        const bx = gw * i + (gw - bw) / 2;
        return (
          <g key={i}>
            <rect x={bx} y={H - 26 - h} width={bw} height={h} rx="4" fill="var(--color-accent)" className="grow" style={{ animationDelay: `${i * 0.08}s` }} />
            <text x={bx + bw / 2} y={H - 32 - h} textAnchor="middle" className="fill-ink text-xs font-bold tabular-nums">
              {r.avgMs ? `${fmt(r.avgMs)} s` : "–"}
            </text>
            <text x={gw * i + gw / 2} y={H - 8} textAnchor="middle" className="fill-muted text-[11px]">
              {names[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Stats({ v, showMe }: { v: View; showMe: boolean }) {
  const t = useT();
  const st = v.stats!;
  const teams = v.players.map((p) => p.team);
  const s = computeStats(st.log, st.turns, st.words, teams, v.scores);
  const names = v.settings.rounds.map((r) => t.round[r].name);
  const author = (i: number) => (i < 0 ? t.aiAuthor : (v.players[i]?.name ?? "?")); // -1: the AI wrote it
  const maxGot = Math.max(1, ...s.players.map((p) => p.got));
  const maxHard = Math.max(1, ...s.hardest.map((h) => h.ms));
  const w = s.winner;

  return (
    <div className="flex flex-col gap-4">
      <Confetti />
      <header className="pop pt-4 pb-2 text-center">
        <p className="text-lg text-muted">{w === null ? t.noWinner : t.winnerIs}</p>
        <h1 className={`mt-1 text-5xl font-extrabold tracking-tight text-balance break-words ${w === null ? "text-ink" : TEAM[w].text}`}>{w === null ? t.tie : v.teamNames[w]}</h1>
        <p data-testid="totals" className={`mt-4 flex flex-wrap items-baseline justify-center font-extrabold tabular-nums ${s.totals.length > 2 ? "gap-2 text-4xl" : "gap-3 text-6xl"}`} aria-label={v.teamNames.map((n, i) => `${n} ${s.totals[i]}`).join(", ")}>
          {s.totals.map((n, i) => (
            <span key={i} className="contents">
              {i > 0 && <span className={`text-muted ${s.totals.length > 2 ? "text-2xl" : "text-3xl"}`}>:</span>}
              <span className={TEAM[i].text}>{n}</span>
            </span>
          ))}
        </p>
        <p className="mt-3 text-muted">{t.summary(v.total, s.turnsTotal, s.skipsTotal)}</p>
      </header>

      <Section title={t.race} note={t.raceNote}>
        <Race race={s.race} turns={st.turns} players={v.players} names={names} teams={v.teamNames} t={t} />
      </Section>

      <Section title={t.perRound}>
        <RoundBars scores={v.scores} names={names} teams={v.teamNames} t={t} />
      </Section>

      <Section title={t.tempo} note={t.tempoNote}>
        <Tempo rounds={s.rounds} names={names} label={t.tempoNote} />
      </Section>

      <Section title={t.players} note={t.playersNote}>
        <ol className="flex flex-col gap-3">
          {s.players.map((p, i) => (
            <li key={p.p}>
              <More
                headClass="flex py-0.5"
                label={`${v.players[p.p].name}: ${t.slipsN(p.got)}`}
                body={() => <PlayerDetail d={playerDetail(st.log, st.turns, p.p, names.length)} names={names} types={v.settings.rounds} words={st.words} t={t} />}
                head={<>
                  <span className="w-5 shrink-0 text-sm font-bold text-muted tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">
                        {v.players[p.p].name}
                        {showMe && p.p === v.me && <span className="text-muted"> ({t.you})</span>}
                      </span>
                      <span className="shrink-0 text-sm text-muted tabular-nums">{p.perZetteli ? t.perSlip(fmt(p.perZetteli)) : "–"}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-2.5 flex-1 rounded-full bg-raised">
                        <div className="growx h-full rounded-full" style={{ width: `${(p.got / maxGot) * 100}%`, background: CHART[p.team], animationDelay: `${i * 0.05}s` }} />
                      </div>
                      <span className="w-6 text-right font-bold tabular-nums">{p.got}</span>
                    </div>
                  </div>
                  {chevron}
                </>}
              />
            </li>
          ))}
        </ol>
      </Section>

      <Section title={t.theSlips}>
        <div className="grid gap-4">
          {s.fastest && <Highlight label={t.fastest} word={st.words[s.fastest.w]} detail={`${fmt(s.fastest.ms)} s, ${names[s.fastest.r]}`} tilt={-2} type={v.settings.rounds[s.fastest.r]} />}
          {s.slowest && s.slowest !== s.fastest && (
            <Highlight label={t.slowest} word={st.words[s.slowest.w]} detail={`${fmt(s.slowest.ms)} s, ${names[s.slowest.r]}`} tilt={1.5} type={v.settings.rounds[s.slowest.r]} />
          )}
          {s.mostSkipped && <Highlight label={t.mostSkipped} word={st.words[s.mostSkipped.w]} detail={t.backInBowl(s.mostSkipped.count)} tilt={-1} />}
        </div>
        <h3 className="mt-6 font-semibold">{t.hardest}</h3>
        <p className="text-sm text-muted">
          {t.hardestNote} {t.tapForDetails}
        </p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {s.hardest.map((h, i) => (
            <li key={h.w}>
              <More
                headClass="flex flex-col items-stretch"
                body={() => <WordDetail d={wordDetail(st.log, h.w, names.length)} names={names} types={v.settings.rounds} players={v.players} t={t} />}
                head={<>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-hand min-w-0 truncate pr-1.5 text-2xl leading-tight font-bold">{h.text}</span>
                    <span className="flex shrink-0 items-center gap-1 text-sm text-muted tabular-nums">
                      {fmt(h.ms)} s, {t.by(author(st.authors[h.w]))}
                      {chevron}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-raised">
                    <div className="growx h-full rounded-full bg-chart-b" style={{ width: `${(h.ms / maxHard) * 100}%`, animationDelay: `${i * 0.05}s` }} />
                  </div>
                </>}
              />
            </li>
          ))}
        </ul>
        <details className={`${expand} mt-5`}>
          <summary className={`${summary} flex justify-between py-2 font-semibold`}>
            {t.allSlips(st.words.length)}
            {chevron}
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {st.words.map((text, w) => (
              <li key={w} className="py-1.5">
                <More
                  headClass="flex justify-between"
                  body={() => <WordDetail d={wordDetail(st.log, w, names.length)} names={names} types={v.settings.rounds} players={v.players} t={t} />}
                  head={<>
                    <span className="font-hand min-w-0 truncate text-xl font-bold">{text}</span>
                    <span className="flex shrink-0 items-center gap-1 text-sm text-muted">
                      {t.by(author(st.authors[w]))}
                      {chevron}
                    </span>
                  </>}
                />
              </li>
            ))}
          </ul>
        </details>
      </Section>

      {/* several phones only: one phone draws on paper, nothing to replay */}
      {showMe && <Drawings code={v.code} drawings={st.drawings ?? []} words={st.words} players={v.players} t={t} />}
      <HeckleStats v={v} t={t} />
    </div>
  );
}

/** who heckled how often, and which teams got a heckle bonus (only when anybody heckled or got one) */
function HeckleStats({ v, t }: { v: View; t: Dict }) {
  const heckles = v.stats?.heckles ?? [];
  const bonus = v.stats?.bonusGot ?? [];
  if (!heckles.length && !bonus.some(Boolean)) return null;
  const by = [...heckles.reduce((m, h) => m.set(h.by, (m.get(h.by) ?? 0) + 1), new Map<number, number>())].sort((a, b) => b[1] - a[1]);
  return (
    <Section title={t.statsHeckle} note={t.statsHeckleNote}>
      {bonus.some(Boolean) && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {bonus.map((n, team) =>
            n ? (
              <li key={team} className={`rounded-full px-3 py-1 text-sm font-semibold ${TEAM[team].soft} ${TEAM[team].text}`}>
                {v.teamNames[team]}: {t.bonusGot(n)}
              </li>
            ) : null,
          )}
        </ul>
      )}
      <ul className="flex flex-col gap-1.5">
        {by.map(([p, n]) => (
          <li key={p} className="flex items-baseline justify-between gap-3">
            <span className={`truncate font-semibold ${TEAM[v.players[p]?.team ?? 0].text}`}>{v.players[p]?.name ?? "?"}</span>
            <span className="shrink-0 text-sm text-muted tabular-nums">{t.heckledN(n)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Highlight({ label, word, detail, tilt, type }: { label: string; word: string; detail: string; tilt: number; type?: RoundType }) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Slip tilt={tilt} className="inline-block max-w-full px-4 pt-2">
          <span className="font-hand text-3xl font-bold break-words">{word}</span>
        </Slip>
        <span className="flex items-center gap-1.5 text-sm text-muted tabular-nums">
          {type && <RoundIcon type={type} className="size-4 shrink-0 text-accent" />}
          {detail}
        </span>
      </div>
    </div>
  );
}

/** a Zetteli round by round: who got it guessed, how long it took, how often it went back into the bowl */
function WordDetail({ d, names, types, players, t }: { d: ReturnType<typeof wordDetail>; names: string[]; types: RoundType[]; players: View["players"]; t: Dict }) {
  return (
    <ul className="mt-2 flex flex-col gap-1.5 rounded-2xl bg-raised p-3 text-sm">
      {d.map((r) => (
        <li key={r.r} className="flex items-start gap-2">
          <RoundIcon type={types[r.r]} className="mt-0.5 size-4 shrink-0 text-accent" />
          <div className="min-w-0">
            <span className="font-semibold">{names[r.r]}</span>
            <span className="text-muted tabular-nums">
              {": "}
              {[r.by === null ? t.notGuessed : t.describedBy(players[r.by]?.name ?? "?"), r.ms ? `${fmt(r.ms)} s` : null, r.skips ? t.skippedN(r.skips) : null].filter(Boolean).join(", ")}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** a player: guessed Zetteli per round, tempo, skips, quickest and slowest word */
function PlayerDetail({ d, names, types, words, t }: { d: ReturnType<typeof playerDetail>; names: string[]; types: RoundType[]; words: string[]; t: Dict }) {
  const word = (e: NonNullable<typeof d.fastest>) => `${words[e.w]}, ${fmt(e.ms)} s, ${names[e.r]}`;
  return (
    <div className="mt-2 ml-7 flex flex-col gap-1.5 rounded-2xl bg-raised p-3 text-sm">
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {d.perRound.map((n, r) => (
          <li key={r} className="flex items-center gap-1.5 tabular-nums">
            <RoundIcon type={types[r]} className="size-4 shrink-0 text-accent" />
            <span className="sr-only">{names[r]}:</span>
            {t.slipsN(n)}
          </li>
        ))}
      </ul>
      <p className="text-muted tabular-nums">{[d.avgMs ? t.perSlip(fmt(d.avgMs)) : null, t.skippedN(d.skips)].filter(Boolean).join(", ")}</p>
      {d.fastest && (
        <p>
          <span className="text-muted">{t.fastest}: </span>
          {word(d.fastest)}
        </p>
      )}
      {d.slowest && (
        <p>
          <span className="text-muted">{t.slowest}: </span>
          {word(d.slowest)}
        </p>
      )}
    </div>
  );
}
