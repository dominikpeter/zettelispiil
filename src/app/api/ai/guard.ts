import { Ratelimit } from "@upstash/ratelimit";
import { authEnabled, currentUser } from "@/lib/auth";
import { roomAi } from "@/lib/room";
import { db, ipOf, redis } from "@/lib/store";
import { aiUsedBy } from "@/lib/usage";
import { after } from "next/server";

// every AI call costs money. Signed in: 60 per minute and 300 per day per account.
// In a room a signed-in host opened: 120 per minute and 300 per day per room (a table writing at once; a leaked code can't drain more),
// and 1000 per day on that host's account.
// Without sign-in set up (local dev): 300 per minute per network. Always: 5000 per day for the whole app.
const limit = (n: number, w: `${number} ${"m" | "d"}`, prefix: string) => redis && new Ratelimit({ redis, limiter: w.endsWith("d") ? Ratelimit.fixedWindow(n, w) : Ratelimit.slidingWindow(n, w), prefix });
const perUserMin = limit(60, "1 m", "ratelimit:ai-user");
const perUserDay = limit(300, "1 d", "ratelimit:ai-user-day");
const perRoomMin = limit(120, "1 m", "ratelimit:ai-room");
const perRoomDay = limit(300, "1 d", "ratelimit:ai-room-day");
const perHostDay = limit(1000, "1 d", "ratelimit:ai-host-day");
const perIp = limit(300, "1 m", "ratelimit:ai");
const perDay = limit(5000, "1 d", "ratelimit:ai-day");

/**
 * null when the call may go ahead, otherwise the reason it may not ("login" or "rate_limited").
 * `room` is the { code, pid, token } a phone sends from inside a room; a room opened by a signed-in host lets its members in.
 */
export async function refused(req: Request, room?: { code?: unknown; pid?: unknown; token?: unknown }, weight = 1): Promise<null | "login" | "rate_limited"> {
  const user = authEnabled() ? await currentUser(req) : null;
  const host = !user && authEnabled() && room ? await roomAi(db, room.code, room.pid, room.token) : "";
  if (authEnabled() && !user && !host) return "login";
  if (!perUserMin || !perUserDay || !perRoomMin || !perRoomDay || !perHostDay || !perIp || !perDay) return process.env.VERCEL ? "rate_limited" : null; // no Redis: fine on a dev machine, closed when deployed
  try {
    // `weight`: a big request (all Zetteli of a game) costs as many units as the calls it replaces
    const w = { rate: Math.max(1, Math.round(weight)) };
    const checks = user
      ? [perUserMin.limit(user.id, w), perUserDay.limit(user.id, w), perDay.limit("all", w)]
      : host
        ? [perRoomMin.limit(String(room!.code), w), perRoomDay.limit(String(room!.code), w), perHostDay.limit(host, w), perDay.limit("all", w)]
        : [perIp.limit(ipOf(req), w), perDay.limit("all", w)];
    if (!(await Promise.all(checks)).every((r) => r.success)) return "rate_limited";
    const payer = user?.id ?? host;
    after(() => aiUsedBy(payer)); // whose account paid for it, for the admin page; after the answer, not before
    return null;
  } catch {
    return "rate_limited"; // limiter unreachable: no AI rather than unmetered AI
  }
}

/** the JSON answer for a refused call */
export const refusal = (why: "login" | "rate_limited") => Response.json({ ai: false, error: why }, { status: why === "login" ? 401 : 429 });

export const lang = (l: unknown) => (l === "en" || l === "fr" ? l : "de");
