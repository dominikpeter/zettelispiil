import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSettings } from "./settings.ts";
import { TOPICS } from "./topics.ts";

test("Zetteli source: players write by default, the AI only when the host picks it", () => {
  assert.equal(cleanSettings({}).source, "players");
  assert.equal(cleanSettings({ source: "ai" }).source, "ai");
  assert.equal(cleanSettings({ source: "robots" as never }).source, "players");
});

test("AI topics: all by default; unknown ids dropped, duplicates once, never none", () => {
  const all = TOPICS.map((t) => t.id);
  assert.ok(all.length >= 16);
  assert.deepEqual(cleanSettings({}).topics, all);
  assert.deepEqual(cleanSettings({ topics: ["animals", "nope", "animals", "switzerland"] }).topics, ["animals", "switzerland"]);
  assert.deepEqual(cleanSettings({ topics: [] }).topics, all);
  assert.deepEqual(cleanSettings({ topics: "animals" as never }).topics, all);
});
