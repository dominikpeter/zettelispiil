import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedEach, fromPool, ideasFor, key, type CacheRedis } from "./aiCache.ts";

// an in-memory stand-in for the Redis commands the cache uses
function fakeRedis(): CacheRedis {
  const kv = new Map<string, unknown>();
  const lists = new Map<string, unknown[]>();
  const list = (k: string) => lists.get(k) ?? (lists.set(k, []), lists.get(k)!);
  return {
    mget: async <T,>(...keys: string[]) => keys.map((k) => (kv.has(k) ? (kv.get(k) as T) : null)),
    set: async (k, v) => kv.set(k, v),
    lpop: async <T,>(k: string, count: number) => (list(k).length ? (list(k).splice(0, count) as T[]) : null),
    rpush: async (k, ...vs) => list(k).push(...vs),
    ltrim: async (k, start) => lists.set(k, list(k).slice(start < 0 ? Math.max(0, list(k).length + start) : start)),
    expire: async () => 1,
  };
}

test("word checks: asked once, then served from the cache (any capitalisation), only unknown words go to the model", async () => {
  const r = fakeRedis();
  const asked: string[][] = [];
  const model = async (ws: string[]) => (asked.push(ws), ws.map((w) => ({ hint: `about ${w}` })));
  const [a, hitsA] = await cachedEach("c:de", ["Raclette", "Velo"], model, r);
  assert.deepEqual(a, [{ hint: "about Raclette" }, { hint: "about Velo" }]);
  assert.equal(hitsA, 0);
  await new Promise((ok) => setTimeout(ok)); // stores are fire-and-forget
  const [b, hitsB] = await cachedEach("c:de", ["raclette ", "Schoggi", "Velo"], model, r);
  assert.deepEqual(b, [{ hint: "about Raclette" }, { hint: "about Schoggi" }, { hint: "about Velo" }]);
  assert.equal(hitsB, 2);
  assert.deepEqual(asked, [["Raclette", "Velo"], ["Schoggi"]]); // Schoggi was the only new word
});

test("names: the model writes six, one is handed out, the rest wait in the pool for the next taps", async () => {
  const r = fakeRedis();
  let calls = 0;
  const model = async () => (calls++, ["A-Beni", "B-Beni", "C-Beni", "D-Beni", "E-Beni", "F-Beni"]);
  const got: string[] = [];
  for (let i = 0; i < 6; i++) got.push(...(await fromPool("n:beni", 1, [], model, r))[0]);
  assert.equal(calls, 1); // one model call for six taps
  assert.equal(new Set(got).size, 6);
  const [skip] = await fromPool("n:beni", 1, ["A-Beni"], model, r); // pool empty → refill, and names in play are skipped
  assert.equal(calls, 2);
  assert.notEqual(skip[0], "A-Beni");
  const [three, pooled] = await fromPool("n:beni", 3, ["B-Beni"], model, r); // several at once, still skipping names in play
  assert.equal(three.length, 3);
  assert.ok(!three.includes("B-Beni"));
  assert.equal(pooled, 3);
});

test("ideas: a topic asked before is answered from the cache, without words already on the table, and the list stays capped", async () => {
  const r = fakeRedis();
  let calls = 0;
  const model = async () => (calls++, ["Titanic", "Shrek", "Alien", "Heidi", "Up", "Cars", "Jaws", "Rocky", "Bambi"]);
  const [first, cachedFirst] = await ideasFor("i:de:filme", [], model, r);
  assert.equal(first.length, 3);
  assert.equal(cachedFirst, false);
  const [again, cachedAgain] = await ideasFor("i:de:filme", ["Titanic", "Shrek"], model, r);
  assert.equal(cachedAgain, true);
  assert.equal(calls, 1);
  assert.ok(!again.includes("Titanic") && !again.includes("Shrek"));
  for (let i = 0; i < 20; i++) await ideasFor("i:de:filme", ["Titanic", "Shrek", "Alien", "Heidi", "Up", "Cars", "Jaws", "Rocky"], async () => Array.from({ length: 9 }, (_, j) => `Film ${i}-${j}`), r);
  const [[stored]] = [await r.mget<string[]>("i:de:filme")];
  assert.ok(stored!.length <= 45, `kept ${stored!.length}`);
});

test("without Redis everything still works, just uncached", async () => {
  const [a, hits] = await cachedEach("c", ["x"], async () => ["y"], null);
  assert.deepEqual([a, hits], [["y"], 0]);
  assert.deepEqual((await fromPool("p", 1, [], async () => ["n1", "n2"], null))[0], ["n1"]);
  assert.equal(key("  Raclette  Party "), "raclette party");
});
