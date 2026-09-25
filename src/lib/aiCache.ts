// server only: AI answers kept in Redis and reused, so most taps need no model call at all (instant and free).
// Word checks by word, names in pools (the model always writes several, we hand out one at a time), ideas by topic.
// Only words and topics are keys, never who wrote them.
import { redis as live } from "./store";

const DAY = 60 * 60 * 24;
const CHECK_KEEP = 30 * DAY;
const NAMES_KEEP = 14 * DAY;
const IDEAS_KEEP = 30 * DAY;
const POOL_MAX = 30;
const IDEAS_MAX = 45; // per topic: enough variety, and the key stays small

/** the Redis commands this needs; the real client (@upstash/redis) or a stand-in in tests */
export type CacheRedis = {
  mget<T>(...keys: string[]): Promise<(T | null)[]>;
  set(key: string, value: unknown, opts: { ex: number }): Promise<unknown>;
  lpop<T>(key: string, count: number): Promise<T[] | null>;
  rpush(key: string, ...values: unknown[]): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
};
const client = () => live as unknown as CacheRedis | null;

/** a word or topic as a cache key: case and spacing don't matter, accents do ("Müsli" is not "Musli") */
export const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60) || "-";

/** results for `items`, from the cache where known; the rest computed (in one call) and stored. Returns [results, hits]. */
export async function cachedEach<T>(prefix: string, items: string[], compute: (missing: string[]) => Promise<(T | undefined)[]>, r = client()): Promise<[(T | undefined)[], number]> {
  if (!r || !items.length) return [await compute(items), 0];
  const keys = items.map((i) => `${prefix}:${key(i)}`);
  let known: (T | null)[] = [];
  try {
    known = await r.mget<T>(...keys);
  } catch {
    known = items.map(() => null); // cache down: just ask the model
  }
  const missing = items.filter((_, i) => known[i] == null);
  const fresh = missing.length ? await compute(missing) : [];
  const out: (T | undefined)[] = [];
  const writes: Promise<unknown>[] = [];
  let m = 0;
  for (let i = 0; i < items.length; i++) {
    if (known[i] != null) out.push(known[i]!);
    else {
      const v = fresh[m++];
      out.push(v);
      if (v !== undefined) writes.push(r.set(keys[i], v, { ex: CHECK_KEEP }).catch(() => {}));
    }
  }
  await Promise.all(writes); // awaited: a serverless function may be frozen right after it answers
  return [out, items.length - missing.length];
}

/** up to `n` names from the pool at `pool` that aren't in `avoid`; refills it from the model when it runs dry. Returns [names, fromPool]. */
export async function fromPool(pool: string, n: number, avoid: string[], refill: () => Promise<string[]>, r = client()): Promise<[string[], number]> {
  const taken = new Set(avoid.map((a) => a.toLowerCase()));
  const out: string[] = [];
  if (r) {
    try {
      // take what's needed in one go; names already in play are skipped (and a second go makes up for them)
      for (let tries = 0; out.length < n && tries < 3; tries++) {
        const xs = await r.lpop<string>(pool, n - out.length);
        if (!xs?.length) break;
        for (const x of xs.map(String)) if (!taken.has(x.toLowerCase())) (out.push(x), taken.add(x.toLowerCase()));
      }
    } catch {}
  }
  const pooled = out.length;
  if (out.length < n) {
    const fresh = (await refill()).filter((x) => !taken.has(x.toLowerCase()));
    out.push(...fresh.splice(0, n - out.length));
    if (r && fresh.length) {
      try {
        await r.rpush(pool, ...fresh);
        await r.ltrim(pool, -POOL_MAX, -1);
        await r.expire(pool, NAMES_KEEP);
      } catch {}
    }
  }
  return [out, pooled];
}

/** 3 ideas for a topic not in `avoid`, from what earlier players got for it; asks the model for more when too few are left. Returns [ideas, cached]. */
export async function ideasFor(topicKey: string, avoid: string[], refill: () => Promise<string[]>, r = client()): Promise<[string[], boolean]> {
  const want = 3;
  const taken = new Set(avoid.map((a) => a.toLowerCase()));
  const pickFrom = (xs: string[]) => shuffle([...new Set(xs)].filter((x) => !taken.has(x.toLowerCase()))).slice(0, want);
  let known: string[] = [];
  if (r) {
    try {
      known = ((await r.mget<string[]>(topicKey))[0] ?? []).map(String);
    } catch {}
  }
  const cached = pickFrom(known);
  if (cached.length >= want) return [cached, true];
  const fresh = await refill();
  if (r && fresh.length) {
    try {
      await r.set(topicKey, [...new Set([...fresh, ...known])].slice(0, IDEAS_MAX), { ex: IDEAS_KEEP }); // newest first, capped
    } catch {}
  }
  return [pickFrom([...fresh, ...known]), false];
}

export const shuffle = <T,>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
