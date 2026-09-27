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
  pipeline(): {
    hincrby(key: string, field: string, n: number): unknown;
    hset(key: string, v: Record<string, unknown>): unknown;
    hsetnx(key: string, field: string, v: unknown): unknown;
    hexpire(key: string, field: string, seconds: number): unknown;
    hexpireat(key: string, field: string, timestamp: number, option: "NX"): unknown;
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

/** a sign-in: who, when first and last, how often (one round trip, no read-then-write) */
export async function signedIn(user: { id: string; name?: string | null; email?: string | null }, provider: string, now = Date.now(), r = client()) {
  if (!r) return;
  try {
    const p = r.pipeline();
    p.hset(K.who, { [user.id]: { id: user.id, name: user.name ?? "", email: user.email ?? "", provider, last: now } });
    p.del(deletedKey(user.id)); // signed in again after deleting: a new account, rooms may lend its AI again
    p.hsetnx(K.first, user.id, now);
    p.hincrby(K.signins, user.id, 1);
    p.hincrby(dayKey(new Date(now)), "signins", 1);
    for (const k of Object.values(K)) p.hexpire(k, user.id, KEEP);
    for (const k of [...Object.values(K), dayKey(new Date(now))]) p.expire(k, KEEP);
    await p.exec();
  } catch (e) {
    console.error("usage sign-in failed", e);
  }
}

const deletedKey = (id: string) => `usage:deleted:${id}`;
const revokedKey = (id: string) => `auth:revoked-before:${id}`;
const SESSION_KEEP = 60 * 60 * 24 * 30;

/** A fresh sign-in may use the account again, but never restores a session from before deletion. */
export async function sessionRevoked(userId: string, createdAt: Date | string, store: Store = db) {
  const before = await store.get<number>(revokedKey(userId));
  return before !== null && new Date(createdAt).getTime() <= before;
}
/**
 * a deleted account: its record and counters go (the daily totals stay, they name no one), and a marker stops rooms it
 * opened from lending its AI (rooms don't expire at once, and there's no list of them by host). false when Redis failed
 */
export async function forget(userId: string, r = client(), store: Store = db, now = Date.now()) {
  try {
    if (r) {
      const p = r.pipeline();
      for (const k of Object.values(K)) p.hdel(k, userId);
      p.set(deletedKey(userId), 1, { ex: SESSION_KEEP }); // longer than any room stays alive
      await p.exec();
    }
    // Separate from the room marker: signedIn clears that marker, but must never clear session revocation.
    // Auth rejects and removes revoked sessions on access, so they cannot renew past this retention period.
    // Purge first: when storage fails, the existing session must remain usable to retry deletion.
    await store.set(revokedKey(userId), now, { ex: SESSION_KEEP });
    return true;
  } catch (e) {
    console.error("usage forget failed", e);
    return false;
  }
}

/** whether this account was deleted (and not signed in again since) */
export async function deleted(userId: string, r = client()) {
  if (!r || !userId) return false;
  const p = r.pipeline();
  p.get(deletedKey(userId));
  return !!(await p.exec())[0];
}

/** an AI call on this account (its own or, in a host's room, the host's) */
export async function aiUsedBy(userId: string, r = client()) {
  if (!r || !userId) return;
  try {
    const p = r.pipeline();
    p.hincrby(K.ai, userId, 1);
    p.hexpire(K.ai, userId, KEEP);
    p.expire(K.ai, KEEP);
    await p.exec();
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
