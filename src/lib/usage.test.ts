import { test } from "node:test";
import assert from "node:assert/strict";
import { aiUsedBy, count, deleted, forget, report, sessionRevoked, signedIn, type UsageRedis } from "./usage.ts";
import { memoryStore } from "./store.ts";

// an in-memory stand-in for the few Redis hash commands usage.ts uses
function fakeRedis(): UsageRedis & { data: Map<string, Record<string, unknown>>; expires: Map<string, number> } {
  const data = new Map<string, Record<string, unknown>>();
  const expires = new Map<string, number>();
  const h = (k: string) => data.get(k) ?? (data.set(k, {}), data.get(k)!);
  return {
    data,
    expires,
    pipeline() {
      const ops: (() => unknown)[] = [];
      const p = {
        hincrby: (k: string, f: string, n: number) => (ops.push(() => (h(k)[f] = (Number(h(k)[f]) || 0) + n)), p),
        hset: (k: string, v: Record<string, unknown>) => (ops.push(() => Object.assign(h(k), v)), p),
        hsetnx: (k: string, f: string, v: unknown) => (ops.push(() => (f in h(k) ? 0 : ((h(k)[f] = v), 1))), p),
        hexpire: (k: string, f: string, seconds: number) => (ops.push(() => { if (f in h(k)) expires.set(`${k}:${f}`, Date.now() + seconds * 1000); }), p),
        hexpireat: (k: string, f: string, timestamp: number) => (ops.push(() => {
          const key = `${k}:${f}`;
          if (f in h(k) && !expires.has(key)) {
            expires.set(key, timestamp * 1000);
            if (timestamp * 1000 <= Date.now()) delete h(k)[f];
          }
        }), p),
        hget: (k: string, f: string) => (ops.push(() => data.get(k)?.[f] ?? null), p),
        hgetall: (k: string) => (ops.push(() => (data.has(k) ? { ...data.get(k) } : null)), p),
        hdel: (k: string, ...fs: string[]) => (ops.push(() => fs.forEach((f) => delete h(k)[f])), p),
        get: (k: string) => (ops.push(() => (data.has(k) ? data.get(k)!.v : null)), p),
        set: (k: string, v: unknown) => (ops.push(() => data.set(k, { v })), p),
        del: (k: string) => (ops.push(() => data.delete(k)), p),
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

test("usage: a deleted account leaves no trace on the admin page, other accounts and the daily totals stay", async () => {
  const r = fakeRedis();
  const now = new Date("2026-09-25T12:00:00Z");
  await signedIn({ id: "lisa@example.ch", name: "Lisa", email: "lisa@example.ch" }, "apple", now.getTime(), r);
  await signedIn({ id: "tim@example.ch", name: "Tim", email: "tim@example.ch" }, "email", now.getTime(), r);
  await aiUsedBy("lisa@example.ch", r);
  assert.equal(await forget("lisa@example.ch", r), true);
  const rep = await report(1, now, r);
  assert.deepEqual(rep.accounts.map((a) => a.id), ["tim@example.ch"]);
  for (const k of ["usage:accounts", "usage:first", "usage:signins", "usage:ai-by"]) assert.ok(!("lisa@example.ch" in (r.data.get(k) ?? {})), k);
  assert.equal(rep.days[0].signins, 2); // today's count names no one: it stays
  assert.equal(await deleted("lisa@example.ch", r), true); // rooms Lisa opened no longer lend her AI
  assert.equal(await deleted("tim@example.ch", r), false);
  await signedIn({ id: "lisa@example.ch", name: "Lisa", email: "lisa@example.ch" }, "email", now.getTime(), r);
  assert.equal(await deleted("lisa@example.ch", r), false); // back with a new account
});

test("usage: without Redis nothing is counted and the report says so", async () => {
  await count({ rooms: 1 }, new Date(), null);
  const rep = await report(2, new Date(), null);
  assert.equal(rep.live, false);
  assert.equal(rep.accounts.length, 0);
});

test("deleting an account revokes all earlier sign-ins, even after signing in again", async () => {
  const r = fakeRedis();
  const store = memoryStore();
  const id = "several-phones@example.ch";
  const now = Date.now();
  await forget(id, r, store, now);
  for (const at of [now - 60_000, now - 1000, now]) {
    assert.equal(await sessionRevoked(id, new Date(at), store), true);
  }
  await signedIn({ id }, "email", now + 1, r);
  assert.equal(await deleted(id, r), false);
  assert.equal(await sessionRevoked(id, new Date(now - 1000), store), true);
  assert.equal(await sessionRevoked(id, new Date(now + 1), store), false);
  assert.equal(await sessionRevoked("someone-else@example.ch", new Date(now - 1000), store), false);
});

test("deleting an account without Redis still revokes earlier sign-ins", async () => {
  const store = memoryStore();
  const now = Date.now();
  assert.equal(await forget("local@example.ch", null, store, now), true);
  assert.equal(await sessionRevoked("local@example.ch", new Date(now - 1), store), true);
  assert.equal(await sessionRevoked("local@example.ch", new Date(now + 1), store), false);
});

test("a failed account purge leaves the session usable for a retry", async (t) => {
  const r = fakeRedis();
  const pipeline = r.pipeline.bind(r);
  r.pipeline = () => ({ ...pipeline(), exec: async () => { throw new Error("storage unavailable"); } });
  const store = memoryStore();
  t.mock.method(console, "error", () => {});
  assert.equal(await forget("retry@example.ch", r, store), false);
  assert.equal(await sessionRevoked("retry@example.ch", new Date(0), store), false);
});

test("usage field expiry is independent per account and report migrates old records", async () => {
  const r = fakeRedis();
  const now = Date.now();
  const keep = 400 * 86_400_000;
  await signedIn({ id: "active" }, "email", now, r);
  const activeExpiry = r.expires.get("usage:accounts:active");
  await signedIn({ id: "other" }, "email", now, r);
  assert.equal(r.expires.get("usage:accounts:active"), activeExpiry);
  for (const k of ["usage:accounts", "usage:first", "usage:signins", "usage:ai-by"]) {
    assert.ok(r.expires.has(`${k}:other`) || k === "usage:ai-by");
  }
  r.data.get("usage:accounts")!.old = { id: "old", name: "Old", email: "old@example.ch", provider: "email", last: now - keep - 1000 };
  r.data.get("usage:first")!.old = now - keep - 1000;
  r.data.get("usage:signins")!.old = 4;
  r.data.set("usage:ai-by", { old: 8 });
  const result = await report(1, new Date(now), r);
  assert.deepEqual(result.accounts.map((a) => a.id).sort(), ["active", "other"]);
  for (const k of ["usage:accounts", "usage:first", "usage:signins", "usage:ai-by"]) assert.equal(r.data.get(k)?.old, undefined);
});


test("a deleted account cannot lend AI after its old tombstone expires", async () => {
  const r = fakeRedis();
  const id = "long-lived-room@example.ch";
  await signedIn({ id }, "email", Date.now(), r);
  await forget(id, r, memoryStore());
  // Model expiry of the old 30-day tombstone while the room is still receiving daily writes.
  r.data.delete(`usage:deleted:${id}`);
  assert.equal(await deleted(id, r), true);
});
