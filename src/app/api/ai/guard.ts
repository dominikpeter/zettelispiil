import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// every AI call costs money: at most 20 per minute per IP (needs Redis; unlimited in local dev without it)
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const limiter = url && token ? new Ratelimit({ redis: new Redis({ url, token }), limiter: Ratelimit.slidingWindow(20, "1 m"), prefix: "ratelimit:ai" }) : null;

export async function allowed(req: Request) {
  if (!limiter) return true;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  return (await limiter.limit(ip)).success;
}

export const lang = (l: unknown) => (l === "en" || l === "fr" ? l : "de");
