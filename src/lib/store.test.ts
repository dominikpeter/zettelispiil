import { test } from "node:test";
import assert from "node:assert/strict";
import type { Redis } from "@upstash/redis";
import { redisStore } from "./store.ts";

test("a failed lease release preserves the mutation result or original failure", async (t) => {
  t.mock.method(console, "error", () => {});
  const redis = {
    set: async () => "OK",
    eval: async () => { throw new Error("release unavailable"); },
  } as unknown as Redis;
  const db = redisStore(redis);
  assert.equal(await db.withLock("room:test", async () => "saved"), "saved");
  const original = new Error("mutation failed");
  await assert.rejects(db.withLock("room:test", async () => { throw original; }), (e) => e === original);
});
