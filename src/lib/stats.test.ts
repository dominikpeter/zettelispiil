import { test } from "node:test";
import assert from "node:assert/strict";
import type { Ev, TurnLog } from "./room.ts";
import { awards, computeStats, playerDetail, wordDetail } from "./stats.ts";

// two rounds, two words; player 0 skips word 1, player 1 gets it
const log: Ev[] = [
  { w: 0, r: 0, p: 0, ms: 3000, res: "got" },
  { w: 1, r: 0, p: 0, ms: 1000, res: "skip" },
  { w: 1, r: 0, p: 0, ms: 2000, res: "time" },
  { w: 1, r: 0, p: 1, ms: 5000, res: "got" },
  { w: 1, r: 1, p: 1, ms: 2000, res: "got" },
  { w: 0, r: 1, p: 1, ms: 6000, res: "got" },
];
const turns: TurnLog[] = [
  { r: 0, p: 0, got: 1, ms: 6000 },
  { r: 0, p: 1, got: 1, ms: 5000 },
  { r: 1, p: 1, got: 2, ms: 8000 },
];
const authors = [1, 0]; // player 1 wrote word 0, player 0 wrote word 1

test("wordDetail: describer, time, skips and who skipped, per round", () => {
  assert.deepEqual(wordDetail(log, 1, 2), [
    { r: 0, by: 1, ms: 8000, skips: 1, skippedBy: [0] },
    { r: 1, by: 1, ms: 2000, skips: 0, skippedBy: [] },
  ]);
  assert.deepEqual(wordDetail([], 0, 1), [{ r: 0, by: null, ms: 0, skips: 0, skippedBy: [] }]);
});

test("wordDetail: someone who skips the same Zetteli twice is named once", () => {
  const twice: Ev[] = [
    { w: 0, r: 0, p: 2, ms: 500, res: "skip" },
    { w: 0, r: 0, p: 3, ms: 500, res: "skip" },
    { w: 0, r: 0, p: 2, ms: 500, res: "skip" },
  ];
  assert.deepEqual(wordDetail(twice, 0, 1)[0], { r: 0, by: null, ms: 1500, skips: 3, skippedBy: [2, 3] });
});

test("playerDetail: totals, average, skips, fastest and slowest", () => {
  const a = playerDetail(log, turns, 0, 2);
  assert.deepEqual(a.rounds.map((r) => r.got), [1, 0]);
  assert.equal(a.got, 1);
  assert.equal(a.turns, 1);
  assert.equal(a.avgMs, 6000);
  assert.equal(a.skips, 1);
  assert.equal(a.fastest?.w, 0);
  assert.equal(a.slowest, null); // only one word guessed
  assert.deepEqual(a.wrote, []); // no authors given
  const b = playerDetail(log, turns, 1, 2);
  assert.deepEqual(b.rounds.map((r) => r.got), [1, 2]);
  assert.equal(b.avgMs, 13000 / 3);
  assert.deepEqual([b.fastest?.ms, b.slowest?.ms], [2000, 6000]);
  assert.equal(playerDetail(log, turns, 2, 2).avgMs, null);
});

test("playerDetail: per round the words got guessed with their seconds, tempo and skips", () => {
  const a = playerDetail(log, turns, 0, 2);
  assert.deepEqual(a.rounds[0], { r: 0, got: 1, turns: 1, avgMs: 6000, skips: 1, words: [{ w: 0, ms: 3000 }] });
  assert.deepEqual(a.rounds[1], { r: 1, got: 0, turns: 0, avgMs: null, skips: 0, words: [] });
  const b = playerDetail(log, turns, 1, 2);
  assert.deepEqual(b.rounds[1], { r: 1, got: 2, turns: 1, avgMs: 4000, skips: 0, words: [{ w: 1, ms: 2000 }, { w: 0, ms: 6000 }] });
});

test("playerDetail: best turn is the one with most Zetteli, the quicker one on a tie", () => {
  assert.deepEqual(playerDetail(log, turns, 1, 2).bestTurn, { r: 1, p: 1, got: 2, ms: 8000 });
  const tie: TurnLog[] = [
    { r: 0, p: 0, got: 3, ms: 30000 },
    { r: 1, p: 0, got: 3, ms: 20000 },
  ];
  assert.equal(playerDetail([], tie, 0, 2).bestTurn?.r, 1);
  assert.equal(playerDetail([], [], 0, 2).bestTurn, null);
});

test("playerDetail: the Zetteli they wrote, hardest first, with time in hands and skips", () => {
  // player 0 wrote word 1: 8 s in round 0 (skip + time + guess), 2 s in round 1; skipped once
  assert.deepEqual(playerDetail(log, turns, 0, 2, authors).wrote, [{ w: 1, ms: 10000, skips: 1 }]);
  assert.deepEqual(playerDetail(log, turns, 1, 2, authors).wrote, [{ w: 0, ms: 9000, skips: 0 }]);
  assert.deepEqual(playerDetail(log, turns, 0, 2, [-1, -1]).wrote, []); // the AI wrote everything
  // several: the one that took longest first
  assert.deepEqual(playerDetail(log, turns, 0, 2, [0, 0]).wrote.map((x) => x.w), [1, 0]);
});

test("computeStats: every Zetteli gets a rank, 1 = took longest", () => {
  const s = computeStats(log, turns, ["Schoggi", "Velo"], [0, 1], [[1, 1], [0, 2]]);
  assert.deepEqual(s.hardRank, { 1: 1, 0: 2 }); // Velo 10 s, Schoggi 9 s
  assert.deepEqual(s.hardest.map((h) => h.w), [1, 0]);
});

test("awards: top describer, quickest, best turn, most skips, trickiest writer", () => {
  const a = awards(log, turns, authors, 2);
  assert.deepEqual(a, [
    { kind: "top", p: 1, got: 3 },
    { kind: "turn", p: 1, got: 2, r: 1 },
    { kind: "skips", p: 0, n: 1 },
    { kind: "writer", p: 0, ms: 5000 }, // word 1: 8 s + 2 s over 2 rounds; word 0 (player 1): 3 s + 6 s
  ]);
  // "quick" needs two people with at least two guessed Zetteli each
  assert.equal(a.find((x) => x.kind === "quick"), undefined);
});

test("awards: quickest describer among those with two or more", () => {
  const l: Ev[] = [
    { w: 0, r: 0, p: 0, ms: 1000, res: "got" },
    { w: 1, r: 0, p: 0, ms: 1000, res: "got" },
    { w: 2, r: 0, p: 1, ms: 1000, res: "got" },
    { w: 3, r: 0, p: 1, ms: 1000, res: "got" },
    { w: 4, r: 0, p: 1, ms: 1000, res: "got" },
    { w: 5, r: 0, p: 2, ms: 1000, res: "got" }, // one lucky Zetteli doesn't count
  ];
  const ts: TurnLog[] = [
    { r: 0, p: 0, got: 2, ms: 4000 },
    { r: 0, p: 1, got: 3, ms: 30000 },
    { r: 0, p: 2, got: 1, ms: 500 },
  ];
  const a = awards(l, ts, [], 3);
  assert.deepEqual(a.find((x) => x.kind === "quick"), { kind: "quick", p: 0, ms: 2000 });
  assert.deepEqual(a.find((x) => x.kind === "top"), { kind: "top", p: 1, got: 3 });
  assert.deepEqual(a.find((x) => x.kind === "turn"), { kind: "turn", p: 1, got: 3, r: 0 });
  assert.equal(a.find((x) => x.kind === "skips"), undefined); // nobody skipped
  assert.equal(a.find((x) => x.kind === "writer"), undefined); // no authors
});

test("awards: nothing to hand out in an empty game; the AI never wins the writer award", () => {
  assert.deepEqual(awards([], [], [], 4), []);
  assert.equal(awards(log, turns, [-1, 0], 2).find((x) => x.kind === "writer"), undefined); // only one human writer: no comparison
});
