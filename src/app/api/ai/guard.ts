import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// every AI call costs money: 300 per minute per network (a party on one Wi-Fi shares an IP), 5000 per day for the whole app
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
const perIp = redis && new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(300, "1 m"), prefix: "ratelimit:ai" });
const perDay = redis && new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(5000, "1 d"), prefix: "ratelimit:ai-day" });

// Vercel sets these itself; a client-sent x-forwarded-for can't fake them
const ipOf = (req: Request) => req.headers.get("x-vercel-forwarded-for") ?? req.headers.get("x-real-ip") ?? "anon";

export async function allowed(req: Request) {
  if (!perIp || !perDay) return !process.env.VERCEL; // no Redis: fine on a dev machine, closed when deployed
  try {
    const [ip, day] = await Promise.all([perIp.limit(ipOf(req)), perDay.limit("all")]);
    return ip.success && day.success;
  } catch {
    return false; // limiter unreachable: no AI rather than unmetered AI
  }
}

export const lang = (l: unknown) => (l === "en" || l === "fr" ? l : "de");
