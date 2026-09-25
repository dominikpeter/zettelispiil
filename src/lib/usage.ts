// server only: what happens on zettelispiil.ch, counted for the admin page. A few Redis counters per day and one small
// record per signed-in account; nothing about what anyone writes. Everything expires after about a year.
// Without Redis (local dev) nothing is counted.
import { redis as live } from "./store";

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
    hgetall(key: string): unknown;
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
  | `cache_${AiKind}`; // answered from the cache: no model call (zetteli: Zetteli from the pool)

/** add to today's counters; never throws */
export async function count(add: Partial<Record<Counter, number>>, now = new Date(), r = client()) {
  const entries = Object.entries(add).filter(([, n]) => n);
  if (!r || !entries.length) return;
  try {
    const key = dayKey(now);
    const p = r.pipeline();
    for (const [f, n] of entries) p.hincrby(key, f, n!);
    p.expire(key, KEEP);
    await p.exec();
  } catch (e) {
    console.error("usage count failed", e);
  }
}

export type Account = { id: string; name: string; email: string; provider: string; first: number; last: number; signins: number; ai: number };

/** a sign-in: who, when first and last, how often (one round trip, no read-then-write) */
export async function signedIn(user: { id: string; name?: string | null; email?: string | null }, provider: string, now = Date.now(), r = client()) {
  if (!r) return;
  try {
    const p = r.pipeline();
    p.hset(K.who, { [user.id]: { id: user.id, name: user.name ?? "", email: user.email ?? "", provider, last: now } });
    p.hsetnx(K.first, user.id, now);
    p.hincrby(K.signins, user.id, 1);
    p.hincrby(dayKey(new Date(now)), "signins", 1);
    for (const k of [...Object.values(K), dayKey(new Date(now))]) p.expire(k, KEEP);
    await p.exec();
  } catch (e) {
    console.error("usage sign-in failed", e);
  }
}

/** an AI call on this account (its own or, in a host's room, the host's) */
export async function aiUsedBy(userId: string, r = client()) {
  if (!r || !userId) return;
  try {
    const p = r.pipeline();
    p.hincrby(K.ai, userId, 1);
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
  const [f, s, a] = [num(first), num(signins), num(ai)];
  const accounts = Object.values((who ?? {}) as Record<string, Omit<Account, "first" | "signins" | "ai">>)
    .map((x) => ({ ...x, first: f[x.id] ?? x.last, signins: s[x.id] ?? 0, ai: a[x.id] ?? 0 }))
    .sort((x, y) => y.last - x.last);
  return { days: iso.map((day, i) => ({ day, ...num(res[i]) })) as Day[], accounts, live: true };
}
