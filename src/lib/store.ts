import { Redis } from "@upstash/redis";

// the few Redis operations rooms need
export interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts: { ex: number; nx?: boolean }): Promise<boolean>;
  hset(key: string, field: string, value: unknown, ex: number): Promise<void>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  hdel(key: string, field: string): Promise<void>;
  /** append to a list, keeping at most `max` items; returns the length it would have had untrimmed */
  rpush(key: string, values: unknown[], ex: number, max: number): Promise<number>;
  /** a list from `start` to the end, plus a companion key read in the same round trip */
  lrangeWith<T, U>(key: string, start: number, other: string): Promise<{ items: T[]; other: U | null }>;
  /** keep a key for `ex` seconds from now; false when it doesn't exist */
  expire(key: string, ex: number): Promise<boolean>;
}

export function memoryStore(): Store {
  const data = new Map<string, { v: unknown; until: number }>();
  const live = (k: string) => {
    const e = data.get(k);
    if (e && e.until < Date.now()) data.delete(k);
    return data.get(k);
  };
  const clone = <T>(v: unknown) => structuredClone(v) as T;
  return {
    async get<T>(k: string) {
      const e = live(k);
      return e ? clone<T>(e.v) : null;
    },
    async set(k, v, { ex, nx }) {
      if (nx && live(k)) return false;
      data.set(k, { v: clone(v), until: Date.now() + ex * 1000 });
      return true;
    },
    async hset(k, f, v, ex) {
      const h = (live(k)?.v as Record<string, unknown>) ?? {};
      data.set(k, { v: { ...h, [f]: clone(v) }, until: Date.now() + ex * 1000 });
    },
    async hgetall<T>(k: string) {
      return clone<Record<string, T>>(live(k)?.v ?? {});
    },
    async hdel(k, f) {
      const e = live(k);
      if (e) delete (e.v as Record<string, unknown>)[f];
    },
    async rpush(k, vs, ex, max) {
      const list = [...((live(k)?.v as unknown[]) ?? []), ...clone<unknown[]>(vs)];
      data.set(k, { v: list.slice(0, max), until: Date.now() + ex * 1000 });
      return list.length;
    },
    async lrangeWith<T, U>(k: string, start: number, other: string) {
      return { items: clone<T[]>(((live(k)?.v as unknown[]) ?? []).slice(start)), other: live(other) ? clone<U>(live(other)!.v) : null };
    },
    async expire(k, ex) {
      const e = live(k);
      if (e) e.until = Date.now() + ex * 1000;
      return !!e;
    },
  };
}

function redisStore(redis: Redis): Store {
  return {
    get: (k) => redis.get(k),
    async set(k, v, { ex, nx }) {
      return (await (nx ? redis.set(k, v, { ex, nx: true }) : redis.set(k, v, { ex }))) === "OK";
    },
    async hset(k, f, v, ex) {
      await redis.multi().hset(k, { [f]: v }).expire(k, ex).exec();
    },
    async hgetall<T>(k: string) {
      return ((await redis.hgetall(k)) ?? {}) as Record<string, T>;
    },
    async hdel(k, f) {
      await redis.hdel(k, f);
    },
    async rpush(k, vs, ex, max) {
      const [len] = await redis.multi().rpush(k, ...vs).ltrim(k, 0, max - 1).expire(k, ex).exec<[number, string, number]>();
      return len;
    },
    async lrangeWith<T, U>(k: string, start: number, other: string) {
      const [items, o] = await redis.pipeline().lrange<T>(k, start, -1).get<U>(other).exec<[T[], U | null]>();
      return { items: items ?? [], other: o };
    },
    async expire(k, ex) {
      return (await redis.expire(k, ex)) === 1;
    },
  };
}

// Vercel's Upstash integration sets KV_REST_API_*; plain Upstash uses UPSTASH_REDIS_REST_*
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const persistent = !!(url && token);
/** the shared Upstash client (rooms, rate limits), or null without Redis */
export const redis = url && token ? new Redis({ url, token }) : null;
/** the caller's IP as Vercel saw it; Vercel sets these headers itself, so a client-sent x-forwarded-for can't fake them */
export const ipOf = (req: Request) => req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-real-ip") ?? "anon";

// ponytail: memory fallback only works on a single dev server; on Vercel each function instance has its own memory
const g = globalThis as { __zettelispiilStore?: Store };
export const db: Store =
  redis ? redisStore(redis) : (g.__zettelispiilStore ??= memoryStore());
