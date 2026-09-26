import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSettings, secondsFor, type Settings } from "./settings.ts";
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

test("seconds per round: kept per known round type, clamped to 10–120 in steps of 5; otherwise every round uses the usual seconds", () => {
  const s = cleanSettings({ seconds: 30, rounds: ["describe", "draw"], roundSeconds: { draw: 61, describe: 5, bogus: 40 } as never });
  assert.deepEqual(s.roundSeconds, { draw: 60, describe: 10 }); // 61 → 60, 5 → 10, unknown round dropped
  assert.equal(secondsFor(s, "draw"), 60);
  assert.equal(secondsFor(s, "describe"), 10);
  assert.equal(secondsFor(s, "sound"), 30); // no own time: the usual
  assert.equal(secondsFor(s, undefined), 30);
  assert.deepEqual(cleanSettings({ seconds: 45 }).roundSeconds, {}); // not set: none
  // a room saved before the setting existed has no roundSeconds at all
  const old = { ...cleanSettings({ seconds: 45 }), roundSeconds: undefined } as unknown as Settings;
  assert.equal(secondsFor(old, "draw"), 45);
});
