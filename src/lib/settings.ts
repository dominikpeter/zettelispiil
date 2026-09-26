import type { Lang } from "./i18n.ts";
import { TOPIC_IDS } from "./topics.ts";

export const ROUND_TYPES = ["describe", "pantomime", "oneword", "sound", "draw"] as const;
export type RoundType = (typeof ROUND_TYPES)[number];
export const DEFAULT_ROUNDS: RoundType[] = ["describe", "pantomime", "oneword", "sound"]; // the safety-net default (e.g. a room from before a setting existed); local games opt into drawing, it needs every phone to have its own screen
// every phone: drawing needs a screen each, so it's on by default there, second-to-last (a late-game highlight, one round before the finish)
export const ONLINE_DEFAULT_ROUNDS: RoundType[] = ["describe", "pantomime", "oneword", "draw", "sound"];
export const MAX_TEAMS = 4; // the app is built for any number; colours exist for four
export type Settings = { perPlayer: number; seconds: number; rounds: RoundType[]; skips: number; lang: Lang; teams: number; heckle: boolean; heckleMode: "auto" | "fixed"; heckles: number; source: "players" | "ai"; topics: string[] }; // skips: per turn, -1 = unlimited; lang: of the Zetteli (AI check, hints, ideas), each phone keeps its own UI language; heckle: the other teams may disturb the describer, `heckles` times each per turn; source: who writes the Zetteli (ai: nobody knows a word beforehand), about `topics`

const clamp = (n: unknown, lo: number, hi: number, def: number) => Math.max(lo, Math.min(hi, Math.round(Number(n)) || def));

/** the host's settings, kept in range; anything missing or unknown gets its default (also for rooms from before a setting existed) */
export function cleanSettings(s: Partial<Settings>): Settings {
  const rounds = Array.isArray(s.rounds) ? [...new Set(s.rounds.filter((r) => ROUND_TYPES.includes(r)))] : [];
  const topics = Array.isArray(s.topics) ? [...new Set(s.topics.filter((x) => TOPIC_IDS.includes(x)))] : [];
  return {
    perPlayer: clamp(s.perPlayer, 1, 10, 4),
    seconds: Math.round(clamp(s.seconds, 10, 120, 30) / 5) * 5,
    rounds: rounds.length ? rounds : [...DEFAULT_ROUNDS],
    skips: s.skips === -1 ? -1 : clamp(s.skips ?? 1, 0, 5, 0),
    lang: s.lang === "en" || s.lang === "fr" ? s.lang : "de",
    teams: clamp(s.teams, 2, MAX_TEAMS, 2),
    heckle: s.heckle === true,
    heckleMode: s.heckleMode === "fixed" ? "fixed" : "auto", // auto: teams that are behind get a random bonus
    heckles: clamp(s.heckles, 1, 5, 2),
    source: s.source === "ai" ? "ai" : "players",
    topics: topics.length ? topics : [...TOPIC_IDS],
  };
}
