import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { authEnabled, currentUser } from "@/lib/auth";

// every AI call costs money. Signed in: 60 per minute and 300 per day per account.
// Without sign-in set up (local dev): 300 per minute per network. Always: 5000 per day for the whole app.
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
const limit = (n: number, w: `${number} ${"m" | "d"}`, prefix: string) => redis && new Ratelimit({ redis, limiter: w.endsWith("d") ? Ratelimit.fixedWindow(n, w) : Ratelimit.slidingWindow(n, w), prefix });
const perUserMin = limit(60, "1 m", "ratelimit:ai-user");
const perUserDay = limit(300, "1 d", "ratelimit:ai-user-day");
const perIp = limit(300, "1 m", "ratelimit:ai");
const perDay = limit(5000, "1 d", "ratelimit:ai-day");

// Vercel sets these itself; a client-sent x-forwarded-for can't fake them
const ipOf = (req: Request) => req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-real-ip") ?? "anon";

/** null when the call may go ahead, otherwise the reason it may not ("login" or "rate_limited") */
export async function refused(req: Request): Promise<null | "login" | "rate_limited"> {
  const user = authEnabled() ? await currentUser(req) : null;
  if (authEnabled() && !user) return "login";
  if (!perUserMin || !perUserDay || !perIp || !perDay) return process.env.VERCEL ? "rate_limited" : null; // no Redis: fine on a dev machine, closed when deployed
  try {
    const checks = user ? [perUserMin.limit(user.id), perUserDay.limit(user.id), perDay.limit("all")] : [perIp.limit(ipOf(req)), perDay.limit("all")];
    return (await Promise.all(checks)).every((r) => r.success) ? null : "rate_limited";
  } catch {
    return "rate_limited"; // limiter unreachable: no AI rather than unmetered AI
  }
}

/** the JSON answer for a refused call */
export const refusal = (why: "login" | "rate_limited") => Response.json({ ai: false, error: why }, { status: why === "login" ? 401 : 429 });

export const lang = (l: unknown) => (l === "en" || l === "fr" ? l : "de");
