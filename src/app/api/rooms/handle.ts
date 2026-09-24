import { db, persistent } from "@/lib/store";
import { RoomError } from "@/lib/room";
import type { Store } from "@/lib/store";

// shared JSON + error mapping for the room routes
export async function handle(fn: (db: Store) => Promise<unknown>) {
  if (!persistent && process.env.VERCEL) return Response.json({ error: "no_storage" }, { status: 503 });
  try {
    return Response.json((await fn(db)) ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof RoomError) return Response.json({ error: e.code }, { status: e.status });
    if (e instanceof SyntaxError) return Response.json({ error: "bad_request" }, { status: 400 });
    throw e;
  }
}
