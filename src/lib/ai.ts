// server only: AI helpers via the Vercel AI SDK. Everything degrades to "no AI" when OPENAI_API_KEY is missing.
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { Lang } from "./i18n";
import { count } from "./usage";

export const aiEnabled = () => !!process.env.OPENAI_API_KEY;
// always the real API: a shell-wide OPENAI_BASE_URL (e.g. a local proxy) must not leak into the game
const openai = createOpenAI({ baseURL: "https://api.openai.com/v1" });
const model = () => openai(process.env.OPENAI_MODEL ?? "gpt-6-luna");
const LANG_NAME: Record<Lang, string> = { de: "Swiss Standard German (always \"ss\", never \"ß\"; Swiss German words are fine)", en: "English", fr: "French" };

const Check = z.object({
  results: z.array(
    z.object({
      word: z.string().describe("the word exactly as given"),
      corrected: z.string().describe("the correctly spelled word; identical to `word` when it is already right"),
      tooHard: z.boolean().describe("true if friends at a party would rarely know it: very obscure, technical, or a long phrase"),
      reason: z.string().describe("when tooHard, one short sentence why; otherwise empty"),
      hint: z.string().describe("a short hint (max 8 words) that helps the describer understand the word; never contains the word itself"),
    }),
  ),
});
export type WordCheck = z.infer<typeof Check>["results"][number];

/** count the call and its tokens for the admin page */
const meter = (kind: "check" | "names" | "ideas", u: { inputTokens?: number; outputTokens?: number }) =>
  count({ [`ai_${kind}`]: 1, [`tokens_in_${kind}`]: u.inputTokens ?? 0, [`tokens_out_${kind}`]: u.outputTokens ?? 0 });

/** spelling, difficulty and a hint for each Zetteli of one player */
export async function checkWords(words: string[], lang: Lang): Promise<WordCheck[]> {
  const { output, usage } = await generateText({
    model: model(),
    output: Output.object({ schema: Check }),
    system:
      "You help players of Zettelispiil (a salad-bowl party game: guess words from descriptions, charades, one word, sounds, drawing). " +
      `Players write in ${LANG_NAME[lang]}. Fix spelling only, never replace the word with another one; keep names, places and dialect words. ` +
      `Write reasons and hints in ${LANG_NAME[lang]}.`,
    prompt: `Check these words, one result per word, same order:\n${words.map((w, i) => `${i + 1}. ${w}`).join("\n")}`,
  });
  await meter("check", usage);
  // the model's answer is untrusted too: one result per word at most, every text bounded
  return output.results.slice(0, words.length).map((r) => ({
    word: r.word.slice(0, 40),
    corrected: r.corrected.trim().slice(0, 40),
    tooHard: r.tooHard,
    reason: r.reason.slice(0, 160),
    hint: r.hint.slice(0, 80),
  }));
}

const Ideas = z.object({ words: z.array(z.string()) });

/** three good Zetteli for a topic: well known, guessable, varied */
export async function suggestWords(topic: string, lang: Lang, avoid: string[]): Promise<string[]> {
  const { output, usage } = await generateText({
    model: model(),
    output: Output.object({ schema: Ideas }),
    system:
      `You suggest words for Zettelispiil, a party guessing game (describe, charades, one word, sounds, drawing), in ${LANG_NAME[lang]}. ` +
      "Pick things most friends at a party know: people, places, things, films, animals. 1-3 words each, no explanations.",
    prompt: `Topic: ${topic || "anything"}. Give 3 different words. Avoid: ${avoid.join(", ") || "none"}.`,
  });
  await meter("ideas", usage);
  return output.words.map((w) => w.trim().slice(0, 40)).filter(Boolean).slice(0, 3);
}

const Names = z.object({ names: z.array(z.string()) });

// a different nudge every call: the same prompt makes a model give the same favourite name every time
const THEMES = ["mountains and hiking", "trains and buses", "cheese and chocolate", "the weather", "animals of the Alps", "lakes and rivers", "breakfast", "winter sports", "festivals and music", "grandma's kitchen", "space and stars", "the post office", "cows and farms", "city life", "fairy tales", "sports clubs", "gardening", "board games"];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const shuffle = <T,>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

/** fresh funny names for players or teams: asks for a handful around a random theme and hands back a random few */
export async function funnyNames(kind: "player" | "team", lang: Lang, n: number, avoid: string[], base = ""): Promise<string[]> {
  // a name typed already: dress it up instead of replacing it ("Beni" → "Alphornbläser-Beni")
  const others = avoid.filter((a) => a.toLowerCase() !== base.toLowerCase()); // the typed name itself is kept, not avoided
  const around = base
    ? ` Every name must keep "${base}" exactly as written and add something funny around it, like "Alphornbläser-Beni" for "Beni". At most 24 characters.`
    : "";
  const { output, usage } = await generateText({
    model: model(),
    output: Output.object({ schema: Names }),
    system: `You invent short, funny, friendly ${kind === "team" ? "team names (1-3 words)" : "player nicknames (1-2 words)"} for a Swiss party game, in ${LANG_NAME[lang]}. No offensive words. Be surprising: vary the style, never reuse a word stem twice.`,
    prompt: `Give 8 different names, loosely inspired by ${pick(THEMES)}.${around} Do not use or resemble any of these: ${others.join(", ") || "none"}.`,
  });
  await meter("names", usage);
  const taken = new Set(avoid.map((a) => a.toLowerCase()));
  const names = output.names
    .map((s) => s.trim().slice(0, 24))
    .filter((s) => s && !taken.has(s.toLowerCase()) && (!base || s.toLowerCase().includes(base.toLowerCase()))); // the typed name must survive
  return shuffle(names).slice(0, n);
}
