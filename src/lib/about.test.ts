import assert from "node:assert/strict";
import test from "node:test";
import { ABOUT_MAX, cleanAbout, getAbout, setAbout } from "./about.ts";
import { memoryStore } from "./store.ts";

test("about you: one line, Swiss spelling, at most 200 characters, anything that isn't text becomes empty", () => {
  assert.equal(cleanAbout("  spielt\n Alphorn,\t liebt   die Straße  "), "spielt Alphorn, liebt die Strasse");
  assert.equal(cleanAbout("x".repeat(500)).length, ABOUT_MAX);
  assert.equal(cleanAbout(undefined), "");
  assert.equal(cleanAbout(null), "");
  assert.equal(cleanAbout(42), "");
  assert.equal(cleanAbout({}), "");
});

test("about you: stored under a hash of the account, never under the readable address", async () => {
  const mem = memoryStore();
  const keys: string[] = [];
  const spy = { ...mem, set: async (k: string, v: unknown, o: { ex: number; nx?: boolean }) => (keys.push(k), mem.set(k, v, o)) } as typeof mem;
  await setAbout("lisa@example.ch", "liebt Rösti", spy);
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^about:[0-9a-f]{64}$/);
  assert.ok(!keys[0].includes("lisa"));
  assert.equal(await getAbout("lisa@example.ch", spy), "liebt Rösti");
});

test("about you: a text that looks like JSON (\"42\", \"true\") comes back as text, even from a store that parses JSON like Redis", async () => {
  const mem = memoryStore();
  const parsing = { ...mem, get: async <T,>(k: string) => JSON.parse(JSON.stringify(await mem.get<T>(k))) as T } as typeof mem; // what @upstash/redis hands back
  await setAbout("a", "42", parsing);
  assert.equal(await getAbout("a", parsing), "42");
  await setAbout("a", "true", parsing);
  assert.equal(await getAbout("a", parsing), "true");
});

test("about you: saved per account, read back, cleared by an empty text, and never mixed between accounts", async () => {
  const store = memoryStore();
  assert.equal(await getAbout("a", store), "");
  await setAbout("a", "  liebt Rösti ", store);
  await setAbout("b", "spielt Alphorn", store);
  assert.equal(await getAbout("a", store), "liebt Rösti");
  assert.equal(await getAbout("b", store), "spielt Alphorn");
  await setAbout("a", "   ", store);
  await new Promise((r) => setTimeout(r, 1100)); // an empty text is kept for a second, then gone
  assert.equal(await getAbout("a", store), "");
  assert.equal(await getAbout("b", store), "spielt Alphorn");
});
