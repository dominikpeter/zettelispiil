import type { Ev, Team, TurnLog } from "./room.ts";

export type Stats = ReturnType<typeof computeStats>;

/** Everything the end screen shows, derived from the game log. */
export function computeStats(
  log: Ev[],
  turns: TurnLog[],
  words: string[],
  teams: Team[],
  scores: [number, number][],
) {
  const totals: [number, number] = [0, 1].map((t) => scores.reduce((s, r) => s + r[t], 0)) as [number, number];
  const winner: Team | null = totals[0] === totals[1] ? null : totals[0] > totals[1] ? 0 : 1;

  // score after every turn, for the race chart
  const race: [number, number][] = [[0, 0]];
  for (const t of turns) {
    const [a, b] = race.at(-1)!;
    race.push(teams[t.p] === 0 ? [a + t.got, b] : [a, b + t.got]);
  }

  // time per Zetteli per round: every moment it was in someone's hand counts
  const hand = new Map<string, { w: number; r: number; ms: number; skips: number }>();
  for (const e of log) {
    const key = `${e.r}:${e.w}`;
    const h = hand.get(key) ?? { w: e.w, r: e.r, ms: 0, skips: 0 };
    h.ms += e.ms;
    if (e.res === "skip") h.skips++;
    hand.set(key, h);
  }
  const guessed = log.filter((e) => e.res === "got").map((e) => hand.get(`${e.r}:${e.w}`)!);
  const byTime = [...guessed].sort((x, y) => x.ms - y.ms);

  const rounds = scores.map((_, r) => {
    const hs = guessed.filter((h) => h.r === r);
    return { avgMs: hs.length ? hs.reduce((s, h) => s + h.ms, 0) / hs.length : 0 };
  });

  const players = teams
    .map((team, p) => {
      const mine = log.filter((e) => e.p === p);
      const got = mine.filter((e) => e.res === "got").length;
      const ms = turns.filter((t) => t.p === p).reduce((s, t) => s + t.ms, 0);
      return { p, team, got, ms, perZetteli: got ? ms / got : null };
    })
    .sort((x, y) => y.got - x.got || (x.perZetteli ?? Infinity) - (y.perZetteli ?? Infinity));

  const skips = new Map<number, number>();
  for (const e of log) if (e.res === "skip") skips.set(e.w, (skips.get(e.w) ?? 0) + 1);
  const [mostSkipped] = [...skips].sort((x, y) => y[1] - x[1]);

  const perWord = words.map((text, w) => ({ w, text, ms: guessed.filter((h) => h.w === w).reduce((s, h) => s + h.ms, 0) }));

  return {
    totals,
    winner,
    race,
    rounds,
    players,
    fastest: byTime[0] ?? null,
    slowest: byTime.at(-1) ?? null,
    mostSkipped: mostSkipped ? { w: mostSkipped[0], count: mostSkipped[1] } : null,
    hardest: [...perWord].sort((x, y) => y.ms - x.ms).slice(0, 5),
    skipsTotal: log.filter((e) => e.res === "skip").length,
    turnsTotal: turns.length,
  };
}

/** one Zetteli, round by round: who got it guessed, how long it was in hands, how often it was skipped */
export function wordDetail(log: Ev[], w: number, rounds: number) {
  return Array.from({ length: rounds }, (_, r) => {
    const es = log.filter((e) => e.w === w && e.r === r);
    return {
      r,
      by: es.find((e) => e.res === "got")?.p ?? null,
      ms: es.reduce((s, e) => s + e.ms, 0),
      skips: es.filter((e) => e.res === "skip").length,
    };
  });
}

/** one player: Zetteli guessed per round, time per Zetteli, skips, fastest and slowest guessed word */
export function playerDetail(log: Ev[], turns: TurnLog[], p: number, rounds: number) {
  const mine = log.filter((e) => e.p === p);
  const got = mine.filter((e) => e.res === "got").sort((x, y) => x.ms - y.ms);
  const ms = turns.filter((t) => t.p === p).reduce((s, t) => s + t.ms, 0);
  return {
    perRound: Array.from({ length: rounds }, (_, r) => got.filter((e) => e.r === r).length),
    avgMs: got.length ? ms / got.length : null,
    skips: mine.filter((e) => e.res === "skip").length,
    fastest: got[0] ?? null,
    slowest: got.length > 1 ? got.at(-1)! : null,
  };
}
