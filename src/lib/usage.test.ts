import { test } from "node:test";
import assert from "node:assert/strict";
import { aiUsedBy, count, report, signedIn, type UsageRedis } from "./usage.ts";

// an in-memory stand-in for the few Redis hash commands usage.ts uses
function fakeRedis(): UsageRedis & { data: Map<string, Record<string, unknown>> } {
  const data = new Map<string, Record<string, unknown>>();
  const h = (k: string) => data.get(k) ?? (data.set(k, {}), data.get(k)!);
  return {
    data,
    pipeline() {
      const ops: (() => unknown)[] = [];
      const p = {
        hincrby: (k: string, f: string, n: number) => (ops.push(() => (h(k)[f] = (Number(h(k)[f]) || 0) + n)), p),
        hset: (k: string, v: Record<string, unknown>) => (ops.push(() => Object.assign(h(k), v)), p),
        hsetnx: (k: string, f: string, v: unknown) => (ops.push(() => (f in h(k) ? 0 : ((h(k)[f] = v), 1))), p),
        hgetall: (k: string) => (ops.push(() => (data.has(k) ? { ...data.get(k) } : null)), p),
        expire: () => (ops.push(() => 1), p),
        exec: async () => ops.map((o) => o()),
      };
      return p;
    },
  };
}

test("usage: daily counters, sign-ins and AI calls per account end up on the admin report", async () => {
  const r = fakeRedis();
  const now = new Date("2026-09-25T12:00:00Z");
  await count({ rooms: 1, games: 1, ai_check: 2, tokens_in_check: 100, tokens_out_check: 40 }, now, r);
  await count({ rooms: 1, joins: 3 }, now, r);
  await signedIn({ id: "u1", name: "Lisa", email: "lisa@example.ch" }, "google", now.getTime() - 60_000, r);
  await signedIn({ id: "u1", name: "Lisa M.", email: "lisa@example.ch" }, "google", now.getTime(), r);
  await Promise.all([aiUsedBy("u1", r), aiUsedBy("u1", r), aiUsedBy("u1", r)]); // at the same time: none lost

  const rep = await report(3, now, r);
  assert.equal(rep.days.length, 3);
  assert.deepEqual(rep.days.at(-1), { day: "2026-09-25", rooms: 2, games: 1, joins: 3, ai_check: 2, tokens_in_check: 100, tokens_out_check: 40, signins: 2 });
  assert.deepEqual(rep.days[0], { day: "2026-09-23" });
  const [lisa] = rep.accounts;
  assert.equal(lisa.name, "Lisa M."); // latest profile
  assert.equal(lisa.signins, 2);
  assert.equal(lisa.ai, 3);
  assert.equal(lisa.first, now.getTime() - 60_000); // first sign-in kept
  assert.equal(lisa.last, now.getTime());
});

test("usage: without Redis nothing is counted and the report says so", async () => {
  await count({ rooms: 1 }, new Date(), null);
  const rep = await report(2, new Date(), null);
  assert.equal(rep.live, false);
  assert.equal(rep.accounts.length, 0);
});
