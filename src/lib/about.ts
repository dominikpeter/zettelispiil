// server only: what a signed-in player writes about themselves (hobbies, something funny), so the AI can build their
// own nickname and word ideas around it. One short text per account in the store (Redis; memory without it), kept
// about a year after the last change, gone with the account. It only ever goes into that player's own AI calls, never
// into the shared name and idea pools
import { db, type Store } from "./store";

export const ABOUT_MAX = 200;
const KEEP = 60 * 60 * 24 * 400; // seconds, like the account's own record
const key = (userId: string) => `about:${userId}`;

/** trimmed, one paragraph, at most ABOUT_MAX characters, Swiss spelling */
export const cleanAbout = (s: unknown) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .replace(/ß/g, "ss")
    .trim()
    .slice(0, ABOUT_MAX);

export async function getAbout(userId: string, store: Store = db) {
  return (await store.get<string>(key(userId))) ?? "";
}

/** saves it; an empty text clears it */
export async function setAbout(userId: string, text: string, store: Store = db) {
  await store.set(key(userId), cleanAbout(text), { ex: cleanAbout(text) ? KEEP : 1 });
}
