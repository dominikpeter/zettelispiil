import { aiEnabled, suggestWords } from "@/lib/ai";
import { lang, refusal, refused } from "../guard";

// POST { topic, lang, avoid, room? } → { ai: false } | { ai: true, words: string[3] }
export async function POST(req: Request) {
  if (!aiEnabled()) return Response.json({ ai: false });
  const body = await req.json().catch(() => ({}));
  const no = await refused(req, body?.room);
  if (no) return refusal(no);
  const topic = String(body?.topic ?? "").trim().slice(0, 60);
  const avoid = Array.isArray(body?.avoid) ? body.avoid.slice(0, 20).map((a: unknown) => String(a).slice(0, 40)) : [];
  try {
    return Response.json({ ai: true, words: await suggestWords(topic, lang(body?.lang), avoid) });
  } catch (e) {
    console.error("ai ideas failed", e);
    return Response.json({ ai: false, error: "ai_failed" });
  }
}
