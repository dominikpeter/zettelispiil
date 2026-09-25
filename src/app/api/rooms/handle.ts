import { Ratelimit } from "@upstash/ratelimit";
import { db, ipOf, persistent, redis } from "@/lib/store";
import { RoomError } from "@/lib/room";
import type { Store } from "@/lib/store";

// writes are metered per network so a script can't fill Redis; reads (polling) aren't, they grow nothing
// per minute and IP; a household behind one IP plays with ~8 phones. Draw counts per room too (one drawer flushes every 120 ms at most = 500/min),
// so two tables on the same Wi-Fi don't share it
// ponytail: draw bounds Redis growth to ~600 × 40 KB per minute per room (sheets expire after an hour); add a per-room byte budget if that ever bites
const LIMITS = { create: 20, act: 600, draw: 600 } as const;
const limiters = redis && Object.fromEntries(Object.entries(LIMITS).map(([k, n]) => [k, new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(n, "1 m"), prefix: `ratelimit:rooms-${k}` })]));
const MAX_BODY = 100_000; // bytes; the biggest real request, a batch of drawing strokes, stays under 50 KB

// shared JSON + error mapping for the room routes; pass `write` for requests that change state
export async function handle(fn: (db: Store) => Promise<unknown>, write?: { req: Request; kind: keyof typeof LIMITS; scope?: string }) {
  if (!persistent && process.env.VERCEL) return Response.json({ error: "no_storage" }, { status: 503 });
  if (write) {
    // browsers always send the length of a JSON body; no length (chunked) is refused rather than read unbounded
    if (!(Number(write.req.headers.get("content-length")) <= MAX_BODY)) return Response.json({ error: "bad_request" }, { status: 413 });
    // ponytail: limiter unreachable → let the game go on; an outage shouldn't stop a party
    // only on Vercel: elsewhere there's no trustworthy client IP and everyone would share one bucket
    const ok = process.env.VERCEL ? await limiters?.[write.kind].limit(`${write.scope ?? ""}:${ipOf(write.req)}`).then((r) => r.success, () => true) : true;
    if (ok === false) return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  try {
    return Response.json((await fn(db)) ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof RoomError) return Response.json({ error: e.code }, { status: e.status });
    if (e instanceof SyntaxError) return Response.json({ error: "bad_request" }, { status: 400 });
    throw e;
  }
}
