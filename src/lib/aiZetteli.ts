// server only: the Zetteli the AI writes for a game ("KI schreibt"). The model writes a batch per topic; what a game doesn't
// need waits in a pool per language and topic for the next game, so most games need no model call. Every word served is
// remembered for 30 days per language, and not served again in that time while there are others.
// Only topic ids and AI-written words are stored or sent to the model, never anything a player typed.
import type { Lang } from "./i18n.ts";
import { MAX_AI_WORDS, norm, type Slip } from "./room.ts";
import { TOPIC_IDS } from "./topics.ts";
import { shuffle } from "./aiCache.ts";
import { redis as live } from "./store.ts";

const DAY = 86_400; // seconds
const RECENT_MS = 30 * DAY * 1000;
const POOL_MAX = 200; // per language and topic
const POOL_KEEP = 30 * DAY;
const AVOID_MAX = 60; // recent words of a topic the model is told to skip
const ASK_MAX = 80; // words per model call

/** the Redis commands this needs; the real client (@upstash/redis) or a stand-in in tests */
export type SupplyRedis = {
  lpop<T>(key: string, count: number): Promise<T[] | null>;
  rpush(key: string, ...values: unknown[]): Promise<number>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
  zadd(key: string, ...members: { score: number; member: string }[]): Promise<unknown>;
  zrange(key: string, min: number, max: number, opts: { byScore: true }): Promise<string[]>;
  zremrangebyscore(key: string, min: number, max: number): Promise<unknown>;
};
const client = () => live as unknown as SupplyRedis | null;

/** the model writing `n` Zetteli with hints about one topic, none of `avoid` */
export type WriteZetteli = (topic: string, lang: string, n: number, avoid: string[]) => Promise<Slip[]>;

const poolKey = (lang: string, topic: string) => `ai:zetteli:pool:${lang}:${topic}`;
const recentKey = (lang: string) => `ai:zetteli:recent:${lang}`;
const SEP = "|"; // recent members are "topic|word": a word counts as used whatever topic it came from

/** a phone's request for AI Zetteli, in bounds: 1…MAX_AI_WORDS words, known topics only (none: all), de/en/fr */
export function zetteliRequest(body: { count?: unknown; topics?: unknown; lang?: unknown }): { count: number; topics: string[]; lang: Lang } {
  const topics = Array.isArray(body.topics) ? [...new Set(body.topics.filter((t): t is string => typeof t === "string" && TOPIC_IDS.includes(t)))] : [];
  return {
    count: Math.max(1, Math.min(MAX_AI_WORDS, Math.round(Number(body.count)) || 1)),
    topics: topics.length ? topics : [...TOPIC_IDS],
    lang: body.lang === "en" || body.lang === "fr" ? body.lang : "de",
  };
}

/** how many Zetteli each topic gets: an even share, the rest to random topics */
function shares(topics: string[], count: number) {
  const order = shuffle(topics);
  return new Map(order.map((t, i) => [t, Math.floor(count / order.length) + (i < count % order.length ? 1 : 0)]));
}

/**
 * `count` different Zetteli spread over `topics`: from the pools first, the model for the rest (one call per topic that's short).
 * Returns the Zetteli (shuffled) and how many came from a pool. Throws when nothing at all could be found.
 */
export async function supplyZetteli({ lang, topics, count, write, now = Date.now(), r = client() }: { lang: string; topics: string[]; count: number; write: WriteZetteli; now?: number; r?: SupplyRedis | null }) {
  const safe = async <T,>(f: () => Promise<T>, fallback: T) => {
    if (!r) return fallback;
    try {
      return await f();
    } catch {
      return fallback; // cache down: the model still writes the game's words
    }
  };
  // what was served lately, per word and per topic (for the prompt)
  const recentMembers = await safe(async () => {
    await r!.zremrangebyscore(recentKey(lang), 0, now - RECENT_MS);
    return r!.zrange(recentKey(lang), now - RECENT_MS, Number.MAX_SAFE_INTEGER, { byScore: true });
  }, [] as string[]);
  const recent = new Set<string>();
  const recentOf = new Map<string, string[]>();
  for (const m of recentMembers) {
    const at = m.indexOf(SEP);
    const [topic, word] = at < 0 ? ["", m] : [m.slice(0, at), m.slice(at + 1)];
    recent.add(norm(word));
    recentOf.set(topic, [...(recentOf.get(topic) ?? []), word]);
  }

  const taken = new Set<string>(); // norm of every word in this game
  const chosen: { topic: string; slip: Slip }[] = [];
  const usable = (s: Slip) => !!norm(s.word) && !taken.has(norm(s.word)) && !recent.has(norm(s.word));
  const take = (topic: string, s: Slip) => (taken.add(norm(s.word)), chosen.push({ topic, slip: s }));

  // 1. the pools
  const need = shares(topics, count);
  let pooled = 0;
  for (const [topic, n] of need) {
    let got = 0;
    for (let tries = 0; got < n && tries < 3; tries++) {
      const xs = await safe(() => r!.lpop<Slip>(poolKey(lang, topic), n - got), null);
      if (!xs?.length) break;
      for (const s of xs) if (got < n && s && typeof s.word === "string" && usable(s)) (take(topic, { word: s.word, hint: String(s.hint ?? "") }), got++);
    }
    pooled += got;
    need.set(topic, n - got);
  }

  // 2. the model, for every topic that's still short, all at once
  const short = [...need].filter(([, n]) => n > 0);
  const written = await Promise.all(
    short.map(async ([topic, n]) => {
      const avoid = (recentOf.get(topic) ?? []).slice(-AVOID_MAX);
      try {
        return { topic, ok: true, slips: shuffle(await write(topic, lang, Math.min(ASK_MAX, n + Math.max(8, Math.ceil(n * 0.3))), avoid)) };
      } catch (e) {
        console.error("ai zetteli failed", topic, e);
        return { topic, ok: false, slips: [] as Slip[] };
      }
    }),
  );
  if (!pooled && short.length && written.every((w) => !w.ok)) throw new Error("the model wrote nothing");
  const spare: { topic: string; slip: Slip }[] = [];
  const stale: { topic: string; slip: Slip }[] = []; // served lately: only when nothing else is left
  for (const { topic, slips } of written) {
    let n = need.get(topic)!;
    for (const s of slips) {
      if (!norm(s.word) || taken.has(norm(s.word))) continue;
      if (recent.has(norm(s.word))) stale.push({ topic, slip: s });
      else if (n > 0) (take(topic, s), n--);
      else spare.push({ topic, slip: s });
    }
  }
  // 3. a topic came up short: other topics' extras first, then words served lately
  for (const list of [spare, stale])
    while (chosen.length < count && list.length) {
      const x = list.shift()!;
      if (!taken.has(norm(x.slip.word))) take(x.topic, x.slip);
    }
  if (!chosen.length) throw new Error("no Zetteli");

  // remember what this game got, and pool the extras for the next one
  await safe(async () => {
    await r!.zadd(recentKey(lang), ...chosen.map((c) => ({ score: now, member: `${c.topic}${SEP}${c.slip.word}` })));
    await r!.expire(recentKey(lang), RECENT_MS / 1000 + DAY);
    for (const topic of new Set(spare.map((x) => x.topic))) {
      const extras = spare.filter((x) => x.topic === topic && !taken.has(norm(x.slip.word))).map((x) => x.slip);
      if (!extras.length) continue;
      await r!.rpush(poolKey(lang, topic), ...extras);
      await r!.ltrim(poolKey(lang, topic), -POOL_MAX, -1);
      await r!.expire(poolKey(lang, topic), POOL_KEEP);
    }
  }, undefined);
  return { slips: shuffle(chosen.map((c) => c.slip)), pooled };
}
