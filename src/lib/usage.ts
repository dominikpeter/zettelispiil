// server only: what happens on zettelispiil.ch, counted for the admin page. A few Redis counters per day and one small
// record per signed-in account; nothing about what anyone writes. Everything expires after about a year.
// Without Redis (local dev) nothing is counted.
import { db, redis as live, type Store } from "./store";

const KEEP = 60 * 60 * 24 * 400; // seconds: a bit more than a year
const dayKey = (d: Date) => `usage:${d.toISOString().slice(0, 10)}`;
// per account: who (last seen profile), first seen, and two counters kept as atomic hash increments
const K = { who: "usage:accounts", first: "usage:first", signins: "usage:signins", ai: "usage:ai-by" } as const;

/** the few Redis commands this needs; the real client (@upstash/redis) or a stand-in in tests */
export type UsageRedis = {
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
  pipeline(): {
    hincrby(key: string, field: string, n: number): unknown;
    hset(key: string, v: Record<string, unknown>): unknown;
    hsetnx(key: string, field: string, v: unknown): unknown;
    hexpire(key: string, field: string, seconds: number): unknown;
    hexpireat(key: string, field: string, timestamp: number, option: "NX"): unknown;
    hget(key: string, field: string): unknown;
    hgetall(key: string): unknown;
    hdel(key: string, ...fields: string[]): unknown;
    get(key: string): unknown;
    set(key: string, v: unknown, o: { ex: number }): unknown;
    del(key: string): unknown;
    expire(key: string, s: number): unknown;
    exec(): Promise<unknown[]>;
  };
};
const client = () => live as unknown as UsageRedis | null;

type AiKind = "check" | "names" | "ideas" | "zetteli";
export type Counter =
  | "rooms" // online rooms created
  | "joins" // players who joined a room
  | "games" // games started (online)
  | "signins"
  | `ai_${AiKind}` // AI calls per feature
  | `tokens_${"in" | "out"}_${AiKind}`
  | `cache_${AiKind}` // answered from the cache: no model call (zetteli: Zetteli from the pool)
  | "coffees" // "buy me a coffee" payments (Stripe webhook)
  | "coffee_rappen"; // and what they brought in, in Rappen

/** add to today's counters; never throws. false when the write failed (the caller may want to retry) */
export async function count(add: Partial<Record<Counter, number>>, now = new Date(), r = client()): Promise<boolean> {
  const entries = Object.entries(add).filter(([, n]) => n);
  if (!r || !entries.length) return true;
  try {
    const key = dayKey(now);
    const p = r.pipeline();
    for (const [f, n] of entries) p.hincrby(key, f, n!);
    p.expire(key, KEEP);
    await p.exec();
    return true;
  } catch (e) {
    console.error("usage count failed", e);
    return false;
  }
}

export type Account = { id: string; name: string; email: string; provider: string; first: number; last: number; signins: number; ai: number };

// The watermark check and profile restoration must be one Redis operation: an in-flight sign-in may finish
// after deletion. `now` is the session's creation time, not the time its after-hook finally runs.
const SIGNED_IN = `
local revoked = tonumber(redis.call('GET', KEYS[1]))
if revoked and tonumber(ARGV[3]) <= revoked then return 0 end
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
redis.call('HSETNX', KEYS[3], ARGV[1], ARGV[3])
redis.call('HINCRBY', KEYS[4], ARGV[1], 1)
redis.call('HINCRBY', KEYS[6], 'signins', 1)
for i = 2, 5 do
  redis.call('HEXPIRE', KEYS[i], ARGV[4], 'FIELDS', 1, ARGV[1])
  redis.call('EXPIRE', KEYS[i], ARGV[4])
end
redis.call('EXPIRE', KEYS[6], ARGV[4])
return 1`;
const FORGET = `
local revoked = tonumber(redis.call('GET', KEYS[1]))
if revoked and revoked >= tonumber(ARGV[2]) then return 1 end
for i = 2, #KEYS do redis.call('HDEL', KEYS[i], ARGV[1]) end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1`;

/** Record a completed sign-in using its immutable session creation time. */
export async function signedIn(user: { id: string; name?: string | null; email?: string | null }, provider: string, now = Date.now(), r = client(), store: Store = db) {
  try {
    if (!r) {
      await store.withLock(revokedKey(user.id), async (locked) => {
        if (!(await sessionRevoked(user.id, new Date(now), locked))) await locked.set(localProfileKey(user.id), true, { ex: KEEP });
      });
      return;
    }
    const profile = { id: user.id, name: user.name ?? "", email: user.email ?? "", provider, last: now };
    await r.eval(SIGNED_IN, [revokedKey(user.id), ...Object.values(K), dayKey(new Date(now))], [user.id, JSON.stringify(profile), now, KEEP]);
  } catch (e) {
    console.error("usage sign-in failed", e);
  }
}

const localProfileKey = (id: string) => `usage:local-profile:${id}`;
const revokedKey = (id: string) => `auth:revoked-before:${id}`;
const SESSION_KEEP = 60 * 60 * 24 * 30;

/** A fresh sign-in may use the account again, but never restores a session from before deletion. */
export async function sessionRevoked(userId: string, createdAt: Date | string, store: Store = db) {
  const before = await store.get<number>(revokedKey(userId));
  return before !== null && new Date(createdAt).getTime() <= before;
}
/**
 * A deleted account loses its profile and counters (anonymous daily totals stay). Rooms may only lend AI while
 * the host's profile exists, so even a continuously active room cannot outlive deletion. False when storage fails.
 */
export async function forget(userId: string, r = client(), store: Store = db, now = Date.now()) {
  try {
    if (r) {
      await r.eval(FORGET, [revokedKey(userId), ...Object.values(K)], [userId, now, SESSION_KEEP]);
    } else {
      await store.withLock(revokedKey(userId), async (locked) => {
        const before = await locked.get<number>(revokedKey(userId));
        if (before !== null && before >= now) return;
        await locked.set(localProfileKey(userId), false, { ex: SESSION_KEEP });
        await locked.set(revokedKey(userId), now, { ex: SESSION_KEEP });
      });
    }
    return true;
  } catch (e) {
    console.error("usage forget failed", e);
    return false;
  }
}

/** Missing, deleted or expired profiles cannot lend AI; a fresh sign-in restores access. */
export async function deleted(userId: string, r = client(), store: Store = db) {
  if (!userId) return true;
  if (!r) return (await store.get<boolean>(localProfileKey(userId))) !== true;
  const p = r.pipeline();
  p.hget(K.who, userId);
  const account = (await p.exec())[0] as Pick<Account, "last"> | null;
  return !account || account.last <= Date.now() - KEEP * 1000;
}

// An AI call may finish after account deletion; never recreate its counter without a live profile.
const AI_USED = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return 0 end
redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
redis.call('HEXPIRE', KEYS[2], ARGV[2], 'FIELDS', 1, ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[2])
return 1`;

/** an AI call on this account (its own or, in a host's room, the host's) */
export async function aiUsedBy(userId: string, r = client()) {
  if (!r || !userId) return;
  try {
    await r.eval(AI_USED, [K.who, K.ai], [userId, KEEP]);
  } catch {}
}

export type Day = { day: string } & Partial<Record<Counter, number>>;
const num = (o: unknown) => Object.fromEntries(Object.entries((o ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v) || 0]));

/** the last `days` days, oldest first, plus every account (most recent first) */
export async function report(days = 30, now = new Date(), r = client()) {
  const dates = Array.from({ length: days }, (_, i) => new Date(now.getTime() - (days - 1 - i) * 86_400_000));
  const iso = dates.map((d) => d.toISOString().slice(0, 10));
  if (!r) return { days: iso.map((day) => ({ day })) as Day[], accounts: [] as Account[], live: false };
  const p = r.pipeline();
  for (const d of dates) p.hgetall(dayKey(d));
  for (const k of [K.who, K.first, K.signins, K.ai]) p.hgetall(k);
  const res = await p.exec();
  const [who, first, signins, ai] = res.slice(days) as Record<string, unknown>[];
  // Migrate records made before field TTLs existed. NX never shortens an expiry refreshed by a concurrent sign-in.
  const profiles = Object.values((who ?? {}) as Record<string, Omit<Account, "first" | "signins" | "ai">>);
  if (profiles.length) {
    const expiry = r.pipeline();
    for (const a of profiles) for (const k of Object.values(K)) expiry.hexpireat(k, a.id, Math.floor(a.last / 1000) + KEEP, "NX");
    await expiry.exec();
  }
  const [f, s, a] = [num(first), num(signins), num(ai)];
  const accounts = profiles.filter((x) => x.last > now.getTime() - KEEP * 1000)
    .map((x) => ({ ...x, first: f[x.id] ?? x.last, signins: s[x.id] ?? 0, ai: a[x.id] ?? 0 }))
    .sort((x, y) => y.last - x.last);
  return { days: iso.map((day, i) => ({ day, ...num(res[i]) })) as Day[], accounts, live: true };
}
