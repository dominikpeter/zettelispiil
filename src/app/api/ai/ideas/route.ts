import { aiLive, suggestWords } from "@/lib/ai";
import { aboutMe, lang, refusal, refused } from "../guard";

// POST { topic, lang, avoid, room?, me? } (me: the signed-in player writes their own Zetteli, so a few ideas may hint at
// what they wrote about themselves) → { ai: false } | { ai: true, words: string[3] }
export async function POST(req: Request) {
  if (!(await aiLive())) return Response.json({ ai: false });
  const body = await req.json().catch(() => ({}));
  const no = await refused(req, body?.room);
  if (no) return refusal(no);
  const topic = String(body?.topic ?? "").trim().slice(0, 60);
  const avoid = Array.isArray(body?.avoid) ? body.avoid.slice(0, 20).map((a: unknown) => String(a).slice(0, 40)) : [];
  try {
    return Response.json({ ai: true, words: await suggestWords(topic, lang(body?.lang), avoid, await aboutMe(req, body?.me)) });
  } catch (e) {
    console.error("ai ideas failed", e);
    return Response.json({ ai: false, error: "ai_failed" });
  }
}
