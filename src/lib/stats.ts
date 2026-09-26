import type { Ev, Team, TurnLog } from "./room.ts";

export type Stats = ReturnType<typeof computeStats>;

/** time a Zetteli spent in hands per round: every moment it was in someone's hand counts, skips too */
function hands(log: Ev[]) {
  const hand = new Map<string, { w: number; r: number; ms: number; skips: number }>();
  for (const e of log) {
    const key = `${e.r}:${e.w}`;
    const h = hand.get(key) ?? { w: e.w, r: e.r, ms: 0, skips: 0 };
    h.ms += e.ms;
    if (e.res === "skip") h.skips++;
    hand.set(key, h);
  }
  return log.filter((e) => e.res === "got").map((e) => hand.get(`${e.r}:${e.w}`)!); // guessed ones only, once per round
}

/** the turn with the most Zetteli; on a tie the quicker one */
const bestTurnOf = (turns: TurnLog[]) => [...turns].sort((x, y) => y.got - x.got || x.ms - y.ms)[0] ?? null;

/** Everything the end screen shows, derived from the game log. */
export function computeStats(
  log: Ev[],
  turns: TurnLog[],
  words: string[],
  teams: Team[],
  scores: number[][],
) {
  const n = scores[0]?.length ?? 2; // teams
  const totals = Array.from({ length: n }, (_, t) => scores.reduce((s, r) => s + (r[t] ?? 0), 0));
  const best = Math.max(...totals);
  const winner: Team | null = totals.filter((x) => x === best).length > 1 ? null : totals.indexOf(best); // a tie at the top: no winner

  // score of every team after every turn, for the race chart
  const race: number[][] = [totals.map(() => 0)];
  for (const t of turns) race.push(race.at(-1)!.map((x, i) => (i === teams[t.p] ? x + t.got : x)));

  const guessed = hands(log);
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
  const byHardness = [...perWord].sort((x, y) => y.ms - x.ms);

  return {
    totals,
    winner,
    race,
    rounds,
    players,
    fastest: byTime[0] ?? null,
    slowest: byTime.at(-1) ?? null,
    mostSkipped: mostSkipped ? { w: mostSkipped[0], count: mostSkipped[1] } : null,
    hardest: byHardness.slice(0, 5),
    /** per Zetteli: 1 = took the longest over all rounds */
    hardRank: Object.fromEntries(byHardness.map((h, i) => [h.w, i + 1])) as Record<number, number>,
    skipsTotal: log.filter((e) => e.res === "skip").length,
    turnsTotal: turns.length,
  };
}

export type Award =
  | { kind: "top"; p: number; got: number } // most Zetteli guessed while describing
  | { kind: "quick"; p: number; ms: number } // fewest seconds per Zetteli (at least 2 guessed)
  | { kind: "turn"; p: number; got: number; r: number } // most Zetteli in one turn
  | { kind: "skips"; p: number; n: number } // skipped the most
  | { kind: "writer"; p: number; ms: number }; // wrote the Zetteli that took the longest to guess, on average

/**
 * the little trophies at the top of the end screen; each only when it tells something
 * (someone actually guessed, skipped, wrote; a comparison needs at least two people to compare)
 */
export function awards(log: Ev[], turns: TurnLog[], authors: number[], players: number): Award[] {
  const out: Award[] = [];
  const who = Array.from({ length: players }, (_, p) => {
    const got = log.filter((e) => e.p === p && e.res === "got").length;
    const ms = turns.filter((t) => t.p === p).reduce((s, t) => s + t.ms, 0);
    return { p, got, per: got ? ms / got : Infinity, skips: log.filter((e) => e.p === p && e.res === "skip").length };
  });

  const [top] = [...who].sort((x, y) => y.got - x.got || x.per - y.per);
  if (top?.got) out.push({ kind: "top", p: top.p, got: top.got });

  const quick = who.filter((x) => x.got >= 2).sort((x, y) => x.per - y.per);
  if (quick.length >= 2) out.push({ kind: "quick", p: quick[0].p, ms: quick[0].per });

  const bt = bestTurnOf(turns);
  if (bt && bt.got >= 2) out.push({ kind: "turn", p: bt.p, got: bt.got, r: bt.r });

  const [sk] = [...who].sort((x, y) => y.skips - x.skips);
  if (sk?.skips) out.push({ kind: "skips", p: sk.p, n: sk.skips });

  // per author: average time a Zetteli of theirs was in hands until guessed, per round; the AI (-1) doesn't compete
  const guessed = hands(log);
  const writers = [...new Set(authors.filter((a) => a >= 0))]
    .map((p) => {
      const hs = guessed.filter((h) => authors[h.w] === p);
      return { p, ms: hs.length ? hs.reduce((s, h) => s + h.ms, 0) / hs.length : 0 };
    })
    .filter((x) => x.ms > 0)
    .sort((x, y) => y.ms - x.ms);
  if (writers.length >= 2) out.push({ kind: "writer", p: writers[0].p, ms: writers[0].ms });
  return out;
}

/** one Zetteli, round by round: who got it guessed, how long it was in hands, how often and by whom it was skipped */
export function wordDetail(log: Ev[], w: number, rounds: number) {
  return Array.from({ length: rounds }, (_, r) => {
    const es = log.filter((e) => e.w === w && e.r === r);
    const skipped = es.filter((e) => e.res === "skip");
    return {
      r,
      by: es.find((e) => e.res === "got")?.p ?? null,
      ms: es.reduce((s, e) => s + e.ms, 0),
      skips: skipped.length,
      skippedBy: [...new Set(skipped.map((e) => e.p))],
    };
  });
}

/**
 * one player: per round what they got guessed (and how quick each one was), their tempo and skips,
 * their best turn, quickest and slowest Zetteli, and how the Zetteli they wrote fared with the others
 */
export function playerDetail(log: Ev[], turns: TurnLog[], p: number, rounds: number, authors: number[] = []) {
  const mine = log.filter((e) => e.p === p);
  const got = mine.filter((e) => e.res === "got").sort((x, y) => x.ms - y.ms);
  const myTurns = turns.filter((t) => t.p === p);
  const ms = myTurns.reduce((s, t) => s + t.ms, 0);
  const guessed = hands(log);
  return {
    rounds: Array.from({ length: rounds }, (_, r) => {
      const rt = myTurns.filter((t) => t.r === r);
      const words = mine.filter((e) => e.r === r && e.res === "got").map((e) => ({ w: e.w, ms: e.ms }));
      const rms = rt.reduce((s, t) => s + t.ms, 0);
      return { r, got: words.length, turns: rt.length, avgMs: words.length ? rms / words.length : null, skips: mine.filter((e) => e.r === r && e.res === "skip").length, words };
    }),
    got: got.length,
    turns: myTurns.length,
    avgMs: got.length ? ms / got.length : null,
    skips: mine.filter((e) => e.res === "skip").length,
    fastest: got[0] ?? null,
    slowest: got.length > 1 ? got.at(-1)! : null,
    bestTurn: bestTurnOf(myTurns),
    // their own Zetteli: total time in the others' hands over all rounds, and how often they went back into the bowl
    wrote: authors
      .map((a, w) => ({ a, w }))
      .filter((x) => x.a === p)
      .map(({ w }) => ({ w, ms: guessed.filter((h) => h.w === w).reduce((s, h) => s + h.ms, 0), skips: log.filter((e) => e.w === w && e.res === "skip").length }))
      .sort((x, y) => y.ms - x.ms),
  };
}
