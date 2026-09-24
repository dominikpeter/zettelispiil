// one-phone games: the same room logic, kept in this browser's localStorage instead of Redis
import type { Store } from "./store";

const PREFIX = "zettelispiil:local:";

type Entry = { v: unknown; until: number };
function read(k: string): Entry | null {
  try {
    const e = JSON.parse(localStorage.getItem(PREFIX + k) ?? "null") as Entry | null;
    if (e && e.until < Date.now()) {
      localStorage.removeItem(PREFIX + k);
      return null;
    }
    return e;
  } catch {
    return null;
  }
}
function write(k: string, v: unknown, ex: number) {
  try {
    localStorage.setItem(PREFIX + k, JSON.stringify({ v, until: Date.now() + ex * 1000 }));
  } catch {}
}

export const localStore: Store = {
  async get<T>(k: string) {
    return (read(k)?.v as T) ?? null;
  },
  async set(k, v, { ex, nx }) {
    if (nx && read(k)) return false;
    write(k, v, ex);
    return true;
  },
  async hset(k, f, v, ex) {
    write(k, { ...((read(k)?.v as object) ?? {}), [f]: v }, ex);
  },
  async hgetall<T>(k: string) {
    return ((read(k)?.v as Record<string, T>) ?? {}) as Record<string, T>;
  },
  async rpush(k, vs, ex) {
    const list = [...((read(k)?.v as unknown[]) ?? []), ...vs];
    write(k, list, ex);
    return list.length;
  },
  async lrangeWith<T, U>(k: string, start: number, other: string) {
    return { items: ((read(k)?.v as T[]) ?? []).slice(start), other: (read(other)?.v as U) ?? null };
  },
  async hdel(k, f) {
    const e = read(k);
    if (!e) return;
    const h = { ...(e.v as Record<string, unknown>) };
    delete h[f];
    write(k, h, Math.max(1, (e.until - Date.now()) / 1000));
  },
};

/** wipe every key of a finished or abandoned one-phone game */
export function clearLocal() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {}
}
