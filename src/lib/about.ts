// server only: what a signed-in player writes about themselves (hobbies, something funny), so the AI can build their
// own nickname and word ideas around it. One short text per account in the store (Redis; memory without it), kept
// about a year after the last change, gone with the account. It only ever goes into that player's own AI calls, never
// into the shared name and idea pools
import { createHash } from "node:crypto";
import { db, type Store } from "./store";

export const ABOUT_MAX = 200;
const KEEP = 60 * 60 * 24 * 400; // seconds, like the account's own record
// the account id is the e-mail address: hashed, so the text isn't stored under a readable address
const key = (userId: string) => `about:${createHash("sha256").update(userId.toLowerCase()).digest("hex")}`;

/** trimmed, one paragraph, at most ABOUT_MAX characters, Swiss spelling; anything that isn't text is empty */
export const cleanAbout = (s: unknown) =>
  typeof s !== "string"
    ? ""
    : s
        .replace(/\s+/g, " ")
        .replace(/ß/g, "ss")
        .trim()
        .slice(0, ABOUT_MAX);

// kept wrapped in an object: the Redis client parses stored text as JSON on read, so a bare "42" would come back as a number
export async function getAbout(userId: string, store: Store = db) {
  const v = await store.get<{ text?: unknown }>(key(userId));
  return typeof v?.text === "string" ? v.text : "";
}

/** saves it; an empty text clears it */
export async function setAbout(userId: string, text: string, store: Store = db) {
  const clean = cleanAbout(text);
  await store.set(key(userId), { text: clean }, { ex: clean ? KEEP : 1 });
}
