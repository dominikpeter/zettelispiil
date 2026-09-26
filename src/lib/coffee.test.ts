import assert from "node:assert/strict";
import { test } from "node:test";
import { backPath, cleanChf } from "./coffee";

test("amounts: whole francs from 1 to 500, nothing else", () => {
  for (const ok of [1, 5, 10, 500, "7", " 12 "]) assert.equal(cleanChf(ok), Number(ok));
  for (const bad of [0, -5, 1.5, 501, "1.5", "abc", "", null, undefined, NaN, Infinity, "1e3", [5], { chf: 5 }]) assert.equal(cleanChf(bad), null, String(bad));
});

test("back path: only a path on this site, the coffee marker dropped", () => {
  assert.equal(backPath("/r/ABCDE"), "/r/ABCDE");
  assert.equal(backPath("/local?x=1&coffee=thanks"), "/local?x=1");
  for (const bad of ["https://evil.com", "//evil.com/x", "/\\evil.com", "evil", 42, undefined]) assert.equal(backPath(bad), "/", String(bad));
});
