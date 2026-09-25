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

export const loadName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};
export const saveName = (n: string) => {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {}
};

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

/** one funny name from the AI when it's available, otherwise from our own list */
export async function funnyName(kind: "player" | "team", lang: string, avoid: string[], fallback: string[]) {
  try {
    if (aiPref.get() === "off") throw 0; // AI help switched off on this phone
    const r = await fetch("/api/ai/names", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, lang, n: 1, avoid }) }).then((x) => x.json());
    if (r?.ai && r.names?.[0]) return String(r.names[0]);
  } catch {}
  const pool = fallback.filter((n) => !avoid.includes(n));
  return (pool.length ? pool : fallback)[Math.floor(Math.random() * (pool.length || fallback.length))];
}
