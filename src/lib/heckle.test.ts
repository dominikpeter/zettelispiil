// the heckle rules on their own; heckling in a running room (who may press, budget, pause) is tested in room.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSettings } from "./settings.ts";
import { heckleBonus, heckleMs } from "./heckle.ts";

test("heckle: lasts the set seconds, 10 by default, 2–20", () => {
  assert.deepEqual([heckleMs(10), heckleMs(2)], [10_000, 2000]);
  assert.deepEqual([cleanSettings({}).heckleSeconds, cleanSettings({ heckleSeconds: 99 }).heckleSeconds, cleanSettings({ heckleSeconds: 1 }).heckleSeconds], [10, 20, 2]);
});

test("auto heckling: only teams behind the leader may get a bonus, more likely and bigger the further behind", () => {
  const always = () => 0; // the dice always allow it
  const never = () => 0.99;
  assert.deepEqual(heckleBonus([3, 3], 0, always), [0, 0]); // level: nobody
  assert.deepEqual(heckleBonus([5, 3], 0, always), [0, 1]); // team 2 is 2 behind
  assert.deepEqual(heckleBonus([5, 3], 1, always), [0, 0]); // …but it's describing now
  assert.deepEqual(heckleBonus([9, 3, 8, 9], 0, always), [0, 2, 1, 0]); // 6 behind: 2 presses; the co-leader: none
  assert.deepEqual(heckleBonus([9, 3], 0, never), [0, 0]); // the dice can say no
  assert.deepEqual(heckleBonus([4, 3], 0, () => 0.39), [0, 1]); // 1 behind: 40 % chance
  assert.deepEqual(heckleBonus([4, 3], 0, () => 0.41), [0, 0]);
  assert.deepEqual(heckleBonus([20, 0], 0, () => 0.79), [0, 2]); // capped at 80 %
  assert.deepEqual(heckleBonus([20, 0], 0, () => 0.81), [0, 0]);
});
