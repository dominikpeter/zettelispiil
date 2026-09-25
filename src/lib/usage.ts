// server only: what happens on zettelispiil.ch, counted for the admin page. A few Redis counters per day and one small
// record per signed-in account; nothing about what anyone writes. Without Redis (local dev) nothing is counted.
import { redis } from "./store";

const KEEP = 60 * 60 * 24 * 400; // seconds: a bit more than a year of days
const dayKey = (d: Date) => `usage:${d.toISOString().slice(0, 10)}`;

export type Counter =
  | "rooms" // online rooms created
  | "joins" // players who joined a room
  | "games" // games started (online)
  | "signins"
  | `ai_${"check" | "names" | "ideas"}` // AI calls per feature
  | `tokens_${"in" | "out"}_${"check" | "names" | "ideas"}`;

/** add to today's counters; never throws, never slows the caller down much */
export async function count(add: Partial<Record<Counter, number>>, now = new Date()) {
  const r = redis;
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

/** a sign-in: remember who, first and last time */
export async function signedIn(user: { id: string; name?: string | null; email?: string | null }, provider: string, now = Date.now()) {
  const r = redis;
  if (!r) return;
  try {
    const old = await r.hget<Account>("usage:accounts", user.id);
    const a: Account = { id: user.id, name: user.name ?? "", email: user.email ?? "", provider, first: old?.first ?? now, last: now, signins: (old?.signins ?? 0) + 1, ai: old?.ai ?? 0 };
    await Promise.all([r.hset("usage:accounts", { [user.id]: a }), count({ signins: 1 })]);
  } catch (e) {
    console.error("usage sign-in failed", e);
  }
}

/** an AI call on this account (its own or, in a host's room, the host's) */
export async function aiUsedBy(userId: string) {
  const r = redis;
  if (!r || !userId) return;
  try {
    const a = await r.hget<Account>("usage:accounts", userId);
    if (a) await r.hset("usage:accounts", { [userId]: { ...a, ai: a.ai + 1 } });
  } catch {}
}

export type Day = { day: string } & Partial<Record<Counter, number>>;

/** the last `days` days, oldest first, plus every account (most recent first) */
export async function report(days = 30, now = new Date()) {
  const r = redis;
  const dates = Array.from({ length: days }, (_, i) => new Date(now.getTime() - (days - 1 - i) * 86_400_000));
  if (!r) return { days: dates.map((d) => ({ day: d.toISOString().slice(0, 10) })) as Day[], accounts: [] as Account[], live: false };
  const p = r.pipeline();
  for (const d of dates) p.hgetall(dayKey(d));
  p.hgetall("usage:accounts");
  const res = (await p.exec()) as (Record<string, unknown> | null)[];
  const num = (o: Record<string, unknown> | null) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, Number(v) || 0]));
  return {
    days: dates.map((d, i) => ({ day: d.toISOString().slice(0, 10), ...num(res[i]) })) as Day[],
    accounts: Object.values((res[days] ?? {}) as Record<string, Account>).sort((a, b) => b.last - a.last),
    live: true,
  };
}
