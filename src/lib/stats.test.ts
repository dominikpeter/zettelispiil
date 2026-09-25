import { test } from "node:test";
import assert from "node:assert/strict";
import type { Ev, TurnLog } from "./room.ts";
import { playerDetail, wordDetail } from "./stats.ts";

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

test("wordDetail: describer, time and skips per round", () => {
  assert.deepEqual(wordDetail(log, 1, 2), [
    { r: 0, by: 1, ms: 8000, skips: 1 },
    { r: 1, by: 1, ms: 2000, skips: 0 },
  ]);
  assert.deepEqual(wordDetail([], 0, 1), [{ r: 0, by: null, ms: 0, skips: 0 }]);
});

test("playerDetail: per round, average, skips, fastest and slowest", () => {
  const a = playerDetail(log, turns, 0, 2);
  assert.deepEqual(a.perRound, [1, 0]);
  assert.equal(a.avgMs, 6000);
  assert.equal(a.skips, 1);
  assert.equal(a.fastest?.w, 0);
  assert.equal(a.slowest, null); // only one word guessed
  const b = playerDetail(log, turns, 1, 2);
  assert.deepEqual(b.perRound, [1, 2]);
  assert.equal(b.avgMs, 13000 / 3);
  assert.deepEqual([b.fastest?.ms, b.slowest?.ms], [2000, 6000]);
  assert.equal(playerDetail(log, turns, 2, 2).avgMs, null);
});
