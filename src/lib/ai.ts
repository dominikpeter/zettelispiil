// server only: AI helpers via the Vercel AI SDK. Everything degrades to "no AI" when OPENAI_API_KEY is missing.
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { Lang } from "./i18n";

export const aiEnabled = () => !!process.env.OPENAI_API_KEY;
// always the real API: a shell-wide OPENAI_BASE_URL (e.g. a local proxy) must not leak into the game
const openai = createOpenAI({ baseURL: "https://api.openai.com/v1" });
const model = () => openai(process.env.OPENAI_MODEL ?? "gpt-6-luna");
const LANG_NAME: Record<Lang, string> = { de: "German (Swiss German words are fine)", en: "English", fr: "French" };

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

/** spelling, difficulty and a hint for each Zetteli of one player */
export async function checkWords(words: string[], lang: Lang): Promise<WordCheck[]> {
  const { output } = await generateText({
    model: model(),
    output: Output.object({ schema: Check }),
    system:
      "You help players of Zettelispiil (a salad-bowl party game: guess words from descriptions, charades, one word, sounds, drawing). " +
      `Players write in ${LANG_NAME[lang]}. Fix spelling only, never replace the word with another one; keep names, places and dialect words. ` +
      `Write reasons and hints in ${LANG_NAME[lang]}.`,
    prompt: `Check these words, one result per word, same order:\n${words.map((w, i) => `${i + 1}. ${w}`).join("\n")}`,
  });
  return output.results;
}

const Ideas = z.object({ words: z.array(z.string()) });

/** three good Zetteli for a topic: well known, guessable, varied */
export async function suggestWords(topic: string, lang: Lang, avoid: string[]): Promise<string[]> {
  const { output } = await generateText({
    model: model(),
    output: Output.object({ schema: Ideas }),
    system:
      `You suggest words for Zettelispiil, a party guessing game (describe, charades, one word, sounds, drawing), in ${LANG_NAME[lang]}. ` +
      "Pick things most friends at a party know: people, places, things, films, animals. 1-3 words each, no explanations.",
    prompt: `Topic: ${topic || "anything"}. Give 3 different words. Avoid: ${avoid.join(", ") || "none"}.`,
  });
  return output.words.map((w) => w.trim().slice(0, 40)).filter(Boolean).slice(0, 3);
}

const Names = z.object({ names: z.array(z.string()) });

/** fresh funny names for players or teams */
export async function funnyNames(kind: "player" | "team", lang: Lang, n: number, avoid: string[]): Promise<string[]> {
  const { output } = await generateText({
    model: model(),
    output: Output.object({ schema: Names }),
    system: `You invent short, funny, friendly ${kind === "team" ? "team names (1-3 words)" : "player nicknames (1-2 words)"} for a Swiss party game, in ${LANG_NAME[lang]}. No offensive words.`,
    prompt: `Give ${n} different names. Avoid these: ${avoid.join(", ") || "none"}.`,
  });
  return output.names.map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, n);
}
