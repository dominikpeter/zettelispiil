// server only: the owner's switch in /admin that turns AI off for everyone (no key rotation, no redeploy)
import { redis } from "./store";

const KEY = "config:ai";
const FRESH_MS = 10_000; // each server instance re-reads the switch at most every 10 s
let cached: { off: boolean; at: number } | null = null;

/** has the owner switched AI off for everyone? */
export async function aiSwitchedOff() {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.off;
  let off = false;
  try {
    off = !!redis && (await redis.get<string>(KEY)) === "off";
  } catch {
    off = cached?.off ?? false; // Redis hiccup: keep what we knew
  }
  cached = { off, at: Date.now() };
  return off;
}

export async function setAiSwitch(on: boolean) {
  if (!redis) throw new Error("no Redis: the AI switch needs it");
  if (on) await redis.del(KEY);
  else await redis.set(KEY, "off");
  cached = { off: !on, at: Date.now() };
}
