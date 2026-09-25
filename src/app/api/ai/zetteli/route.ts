import { aiLive, aiZetteli } from "@/lib/ai";
import { zetteliRequest } from "@/lib/aiZetteli";
import { refusal, refused } from "../guard";

// "KI schreibt": the host's phone asks for every Zetteli of the game at once (a model call can take a while)
export const maxDuration = 60;

// POST { count, topics: topic ids, lang, room? } → { ai: false, error? } | { ai: true, words: { word, hint }[] }
export async function POST(req: Request) {
  if (!(await aiLive())) return Response.json({ ai: false });
  const body = await req.json().catch(() => ({}));
  const { count, topics, lang } = zetteliRequest(body ?? {});
  const no = await refused(req, body?.room, Math.ceil(count / 10)); // a whole game's Zetteli: 1 unit per 10 words, not 1 for all
  if (no) return refusal(no);
  try {
    return Response.json({ ai: true, words: await aiZetteli(count, topics, lang) });
  } catch (e) {
    console.error("ai zetteli failed", e);
    return Response.json({ ai: false, error: "ai_failed" }); // the host can switch to writing them
  }
}
