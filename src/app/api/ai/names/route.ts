import { aiEnabled, funnyNames } from "@/lib/ai";
import { lang, refusal, refused } from "../guard";

// POST { kind: "player" | "team", lang, n, avoid, room? } → { ai: false } | { ai: true, names: string[] }
export async function POST(req: Request) {
  if (!aiEnabled()) return Response.json({ ai: false });
  const body = await req.json().catch(() => ({}));
  const no = await refused(req, body?.room);
  if (no) return refusal(no);
  const kind = body?.kind === "team" ? "team" : "player";
  const n = Math.max(1, Math.min(3, Number(body?.n) || 1));
  const avoid = Array.isArray(body?.avoid) ? body.avoid.slice(0, 40).map((a: unknown) => String(a).slice(0, 24)) : []; // names in play plus this phone's recent suggestions
  try {
    return Response.json({ ai: true, names: await funnyNames(kind, lang(body?.lang), n, avoid) });
  } catch (e) {
    console.error("ai names failed", e);
    return Response.json({ ai: false, error: "ai_failed" });
  }
}
