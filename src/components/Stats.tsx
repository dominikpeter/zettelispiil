"use client";

import { useState } from "react";
import type { RoundType, View } from "@/lib/room";
import type { Dict } from "@/lib/i18n";
import { useT } from "@/lib/prefs";
import { computeStats } from "@/lib/stats";
import { Confetti, RoundIcon, Slip, TEAM } from "@/lib/ui";

const fmt = (ms: number) => (ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: ms < 10_000 ? 1 : 0 });
const CHART = ["var(--color-chart-a)", "var(--color-chart-b)"];
const W = 340;

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="enter rounded-3xl bg-surface p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {note && <p className="mt-0.5 text-sm text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Legend({ names }: { names: [string, string] }) {
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
function Race({ race, turns, players, names, teams, t }: { race: [number, number][]; turns: NonNullable<View["stats"]>["turns"]; players: View["players"]; names: string[]; teams: [string, string]; t: Dict }) {
  const H = 170;
  const pad = { l: 8, r: 64, t: 10, b: 22 };
  const max = Math.max(1, ...race.flat());
  const x = (i: number) => pad.l + (i / Math.max(1, race.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const [hover, setHover] = useState<number | null>(null);
  const path = (t: 0 | 1) => race.map((p, i) => `${i ? `H${x(i)}V` : `M${x(0)} `}${y(p[t])}`).join("");
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (race.length - 1));
    setHover(Math.max(1, Math.min(race.length - 1, i)));
  };
  const h = hover !== null ? turns[hover - 1] : null;
  const end = race.at(-1)!;
  // keep the two end labels from overlapping
  const ly = [y(end[0]), y(end[1])];
  if (Math.abs(ly[0] - ly[1]) < 16) {
    const mid = (ly[0] + ly[1]) / 2;
    const up = end[0] >= end[1] ? 0 : 1;
    ly[up] = mid - 8;
    ly[1 - up] = mid + 8;
  }

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
        {([0, 1] as const).map((t) => (
          <path key={t} d={path(t)} fill="none" stroke={CHART[t]} strokeWidth="2.5" strokeLinejoin="round" className="draw" pathLength={1} style={{ "--len": 1 } as React.CSSProperties} />
        ))}
        {([0, 1] as const).map((t) => (
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
            {([0, 1] as const).map((t) => (
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
            {race[hover][0]} : {race[hover][1]}
          </div>
        </div>
      )}
    </div>
  );
}

function RoundBars({ scores, names, teams, t }: { scores: [number, number][]; names: string[]; teams: [string, string]; t: Dict }) {
  const H = 150;
  const max = Math.max(1, ...scores.flat());
  const gw = W / scores.length;
  const bw = Math.min(34, gw / 3);
  return (
    <>
      <Legend names={teams} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t.perRound}>
        <line x1="0" x2={W} y1={H - 26} y2={H - 26} stroke="var(--color-line)" />
        {scores.map((s, r) => (
          <g key={r}>
            {s.map((v, t) => {
              const h = (v / max) * (H - 50);
              const bx = gw * r + gw / 2 + (t ? 1 : -bw - 1);
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
              {r.avgMs ? `${fmt(r.avgMs)} s` : "–"}
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
  const maxGot = Math.max(1, ...s.players.map((p) => p.got));
  const maxHard = Math.max(1, ...s.hardest.map((h) => h.ms));
  const w = s.winner;

  return (
    <div className="flex flex-col gap-4">
      <Confetti />
      <header className="pop pt-4 pb-2 text-center">
        <p className="text-lg text-muted">{w === null ? t.noWinner : t.winnerIs}</p>
        <h1 className={`mt-1 text-5xl font-extrabold tracking-tight text-balance break-words ${w === null ? "text-ink" : TEAM[w].text}`}>{w === null ? t.tie : v.teamNames[w]}</h1>
        <p className="mt-4 flex items-baseline justify-center gap-3 text-6xl font-extrabold tabular-nums">
          <span className="text-team-a">{s.totals[0]}</span>
          <span className="text-3xl text-muted">:</span>
          <span className="text-team-b">{s.totals[1]}</span>
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
            <li key={p.p} className="grid grid-cols-[1.5rem_1fr] items-center gap-x-2">
              <span className="text-sm font-bold text-muted tabular-nums">{i + 1}</span>
              <div>
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
            </li>
          ))}
        </ol>
      </Section>

      <Section title={t.theSlips}>
        <div className="grid gap-4">
          {s.fastest && <Highlight label={t.fastest} word={st.words[s.fastest.w]} detail={`${fmt(s.fastest.ms)} s, ${names[s.fastest.r]}`} tilt={-2} type={v.settings.rounds[s.fastest.r]} />}
          {s.slowest && s.slowest !== s.fastest && (
            <Highlight label={t.slowest} word={st.words[s.slowest.w]} detail={`${fmt(s.slowest.ms)} s, ${names[s.slowest.r]}`} tilt={1.5} type={v.settings.rounds[s.slowest.r]} />
          )}
          {s.mostSkipped && <Highlight label={t.mostSkipped} word={st.words[s.mostSkipped.w]} detail={t.backInBowl(s.mostSkipped.count)} tilt={-1} />}
        </div>
        <h3 className="mt-6 font-semibold">{t.hardest}</h3>
        <p className="text-sm text-muted">{t.hardestNote}</p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {s.hardest.map((h, i) => (
            <li key={h.w}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-hand min-w-0 truncate pr-1.5 text-2xl leading-tight font-bold">{h.text}</span>
                <span className="shrink-0 text-sm text-muted tabular-nums">
                  {fmt(h.ms)} s, {t.by(v.players[st.authors[h.w]]?.name ?? "?")}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-raised">
                <div className="growx h-full rounded-full bg-chart-b" style={{ width: `${(h.ms / maxHard) * 100}%`, animationDelay: `${i * 0.05}s` }} />
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
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
