import assert from "node:assert/strict";
import test from "node:test";
import { ABOUT_MAX, cleanAbout, getAbout, setAbout } from "./about.ts";
import { memoryStore } from "./store.ts";

test("about you: one line, Swiss spelling, at most 200 characters, anything that isn't text becomes empty", () => {
  assert.equal(cleanAbout("  spielt\n Alphorn,\t liebt   die Straße  "), "spielt Alphorn, liebt die Strasse");
  assert.equal(cleanAbout("x".repeat(500)).length, ABOUT_MAX);
  assert.equal(cleanAbout(undefined), "");
  assert.equal(cleanAbout(null), "");
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
