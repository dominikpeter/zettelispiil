import type { AiRoom } from "./aiAccess";
import { aiPref } from "./prefs";
// browser side of rooms: who I am in each room, and calls to /api/rooms
export type Identity = { pid: string; token: string };

const idKey = (code: string) => `zettelispiil:room:${code}`;
export const NAME_KEY = "zettelispiil:name";

export function loadIdentity(code: string): Identity | null {
  try {
    return JSON.parse(localStorage.getItem(idKey(code)) ?? "null");
  } catch {
    return null;
  }
}

export function saveIdentity(code: string, id: Identity) {
  try {
    localStorage.setItem(idKey(code), JSON.stringify(id));
  } catch {}
}

// names are typed fresh each time (or made up with the sparkle); a name saved by older versions is dropped once
try {
  localStorage.removeItem(NAME_KEY);
} catch {}

export class ApiError extends Error {}

export async function api<T>(path: string, body?: unknown, id?: Identity | null): Promise<T> {
  const res = await fetch(`/api/rooms${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? { "x-pid": id?.pid ?? "", "x-token": id?.token ?? "" } : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "offline");
  return data as T;
}

// API error code → dictionary key for the message shown to the player
const KNOWN = ["not_found", "started", "full", "no_storage", "rate_limited"] as const;
export const errKey = (e: string): (typeof KNOWN)[number] | "offline" => (KNOWN as readonly string[]).includes(e) ? (e as (typeof KNOWN)[number]) : "offline";

/** "KI schreibt": the host's phone asks the AI for every Zetteli of the game; null when it couldn't */
export async function aiZetteli(count: number, topics: string[], lang: string, room?: AiRoom | null): Promise<{ word: string; hint: string }[] | null> {
  try {
    const r = await fetch("/api/ai/zetteli", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count, topics, lang, room: room ?? null }) }).then((x) => x.json());
    return r?.ai && Array.isArray(r.words) && r.words.length ? r.words : null;
  } catch {
    return null;
  }
}

/** one funny name from the AI when it's available, otherwise from our own list */
const recent: string[] = []; // names this phone was already offered: asked again, the AI must come up with something new
const builtOn = new Map<string, string>(); // suggestion → the typed name it was built on: pressing again restarts from "Beni", not "Alphornbläser-Beni"
const MAX_NAME = 24;

/** a funny name from the AI; with `base` (a name typed already) it builds on that name, e.g. "Beni" → "Alphornbläser-Beni" */
export async function funnyName(kind: "player" | "team", lang: string, avoid: string[], fallback: string[], room?: AiRoom | null, base = "", prefixes: string[] = []) {
  base = builtOn.get(base.trim()) ?? base.trim();
  try {
    if (aiPref.get() === "off") throw 0; // AI help switched off on this phone
    const r = await fetch("/api/ai/names", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, lang, n: 1, avoid: [...avoid, ...recent].slice(-40), room, base }) }).then((x) => x.json());
    if (r?.ai && r.names?.[0]) {
      const name = String(r.names[0]);
      if (base) builtOn.set(name, base);
      recent.push(name);
      if (recent.length > 20) recent.shift();
      return name;
    }
  } catch {}
  // no AI answer: still keep the typed name, when it fits with a prefix
  const fits = prefixes.map((p) => `${p}-${base}`).filter((n) => base && n.length <= MAX_NAME);
  if (fits.length) {
    const name = fits[Math.floor(Math.random() * fits.length)];
    builtOn.set(name, base);
    return name;
  }
  const pool = fallback.filter((n) => !avoid.includes(n));
  return (pool.length ? pool : fallback)[Math.floor(Math.random() * (pool.length || fallback.length))];
}
