import { test } from "node:test";
import assert from "node:assert/strict";
import { advance, PACE_MS } from "./pace.ts";

// play a batch frame by frame at 60 fps and record how much is on screen
function trace(points: number, fps = 60, arrived = 0) {
  const frame = 1000 / fps;
  const seen: number[] = [];
  let shown = 0;
  for (let t = arrived + frame; shown < points && t < 5000; t += frame) {
    shown = advance(shown, points, frame, arrived + PACE_MS - t);
    seen.push(shown);
  }
  return seen;
}

test("a batch of lines is traced in evenly, not popped in", () => {
  const seen = trace(20);
  const ms = seen.length * (1000 / 60);
  assert.ok(ms >= PACE_MS * 0.8 && ms <= PACE_MS * 1.3, `took ${ms} ms`); // about until the next batch lands
  assert.ok(new Set(seen.map(Math.floor)).size >= 15, "many distinct steps"); // smooth, point by point
  const half = seen[Math.floor(seen.length / 2)];
  assert.ok(half > 6 && half < 14, `halfway ${half}`); // steady pace, not front-loaded
});

test("a single point still shows within a moment", () => {
  assert.ok(trace(1).length * (1000 / 60) <= PACE_MS * 1.3);
});

test("a big backlog (joined late) catches up fast", () => {
  const ms = trace(2000).length * (1000 / 60);
  assert.ok(ms <= 450, `took ${ms} ms`);
});

test("nothing new: nothing moves", () => {
  assert.equal(advance(5, 5, 16, 100), 5);
});
