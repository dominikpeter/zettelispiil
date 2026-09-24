import { aiEnabled, checkWords } from "@/lib/ai";
import { allowed, lang } from "../guard";

// POST { words: string[], lang } → { ai: false } | { ai: true, results: WordCheck[] }
export async function POST(req: Request) {
  if (!aiEnabled()) return Response.json({ ai: false });
  if (!(await allowed(req))) return Response.json({ ai: false, error: "rate_limited" }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const words = Array.isArray(body?.words) ? body.words.map((w: unknown) => String(w ?? "").trim().slice(0, 40)).filter(Boolean).slice(0, 10) : [];
  if (!words.length) return Response.json({ ai: false, error: "bad_request" }, { status: 400 });
  try {
    return Response.json({ ai: true, results: await checkWords(words, lang(body?.lang)) });
  } catch (e) {
    console.error("ai check failed", e);
    return Response.json({ ai: false, error: "ai_failed" }); // the game goes on without it
  }
}
