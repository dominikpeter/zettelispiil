"use client";

import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useAiOn, useAiRoom } from "@/lib/aiAccess";
import { useT } from "@/lib/prefs";
import { norm, type Slip as SlipT } from "@/lib/room";
import { Bowl, btn, btn2, fitLine, press, Slip } from "@/lib/ui";
import { Cta, type P } from "./common";

type Check = { corrected: string; tooHard: boolean; reason: string; hint: string };
const CHECK_DELAY = 450; // ms of calm typing before a word is checked (short: the answer itself takes ~2 s)

export function Write({ v, send, busy }: P) {
  const t = useT();
  const lang = v.settings.lang; // the Zetteli's language, set by the host; the UI stays in this phone's language
  const aiOn = useAiOn(); // switched on here, and signed in (or in a signed-in host's room) where that's required
  const aiRoom = useAiRoom();
  const n = v.settings.perPlayer;
  // kept Zetteli stay filled; cancelled duplicates leave an empty slip to rewrite
  const [draft, setDraft] = useState<SlipT[]>(() => {
    const kept = v.myWrite?.words ?? [];
    return Array.from({ length: n }, (_, i) => kept[i] ?? { word: "", hint: "" });
  });
  // AI results by word, filled in the background; the form never waits for them
  const [checks, setChecks] = useState<Record<string, Check | "loading">>({});
  const typedHint = useRef<boolean[]>(draft.map((d) => !!d.hint)); // a hint the writer typed is never overwritten
  const edit = (i: number, patch: Partial<SlipT>) => {
    if (patch.hint !== undefined) typedHint.current[i] = !!patch.hint.trim();
    setDraft((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };
  const dupes = new Set(draft.map((d) => norm(d.word)).filter((w, i, all) => w && all.indexOf(w) !== i));

  // "In die Schüssel": a bowl takes the button's place, the slips fold and fly into it, then we send
  const [tossing, setTossing] = useState(false);
  const [paths, setPaths] = useState<{ dx: number; dy: number }[] | null>(null);
  const slipEls = useRef<(HTMLDivElement | null)[]>([]);
  const bowlEl = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!tossing || !bowlEl.current) return;
    const b = bowlEl.current.getBoundingClientRect();
    setPaths(
      slipEls.current.map((el) => {
        const r = el?.getBoundingClientRect();
        return r ? { dx: b.left + b.width / 2 - (r.left + r.width / 2), dy: b.top + b.height * 0.35 - (r.top + r.height / 2) } : { dx: 0, dy: 300 };
      }),
    );
  }, [tossing]);
  const [caught, setCaught] = useState(0);
  const submit = async () => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return send({ type: "words", words: draft });
    setTossing(true);
    const flight = 700 + (draft.length - 1) * 110;
    draft.forEach((_, i) => setTimeout(() => setCaught((n) => n + 1), 650 + i * 110)); // the bowl bounces as each one lands
    await new Promise((r) => setTimeout(r, flight + 150));
    await send({ type: "words", words: draft });
    setTossing(false);
    setPaths(null);
  };

  const words = draft.map((d) => d.word.trim());
  useEffect(() => {
    const todo = aiOn ? [...new Set(words.filter((w) => w.length >= 2 && !(w in checks)))] : [];
    if (!todo.length) return;
    const timer = setTimeout(async () => {
      setChecks((c) => ({ ...c, ...Object.fromEntries(todo.map((w) => [w, "loading" as const])) }));
      let results: Check[] | null = null;
      try {
        const r = await fetch("/api/ai/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ words: todo, lang, room: aiRoom }) }).then((x) => x.json());
        if (r?.ai && Array.isArray(r.results) && r.results.length === todo.length) results = r.results;
      } catch {}
      const none: Check = { corrected: "", tooHard: false, reason: "", hint: "" };
      setChecks((c) => ({ ...c, ...Object.fromEntries(todo.map((w, i) => [w, results?.[i] ?? none])) }));
      // hints go straight onto the slips, unless the writer already typed one
      if (results)
        setDraft((d) =>
          d.map((x, i) => {
            const k = todo.indexOf(x.word.trim());
            return k >= 0 && !typedHint.current[i] && results[k].hint ? { ...x, hint: results[k].hint } : x;
          }),
        );
    }, CHECK_DELAY);
    return () => clearTimeout(timer);
  }, [words.join("\u0000"), lang, aiOn]); // eslint-disable-line react-hooks/exhaustive-deps -- re-run only when the words change

  if (v.iDone)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="relative h-40 w-48">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="fall mini-slip absolute top-6 h-8 w-12"
              style={{ left: `${30 + i * 18}%`, animationDelay: `${i * 0.5}s`, "--r0": `${-20 + i * 15}deg`, "--r1": `${10 - i * 12}deg` } as CSSProperties}
            />
          ))}
          <Bowl className="absolute bottom-0 left-1/2 w-40 -translate-x-1/2" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight">{t.wordsIn}</h2>
        <p className="text-muted">
          <span key={v.done} className="bump font-bold text-ink tabular-nums">
            {t.done(v.done, v.players.length)}
          </span>
          . {t.soon}
        </p>
      </div>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!tossing) submit();
      }}
      className="enter flex flex-1 flex-col gap-5 short:gap-3"
    >
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight short:text-2xl tiny:text-xl">{t.writeTitle(draft.length)}</h2>
        <p className="mt-1 text-muted short:text-sm tiny:hidden">{t.writeHelp}</p>
      </div>
      {aiOn && (
        <Ideas
          lang={lang}
          avoid={words.filter(Boolean)}
          full={draft.every((d) => d.word.trim())}
          onPick={(w) => {
            const i = draft.findIndex((d) => !d.word.trim());
            if (i >= 0) edit(i, { word: w }); // never over a word the player wrote
          }}
        />
      )}
      {v.myWrite?.cancelled.map((w) => (
        <p key={w} role="alert" className="pop flex items-start gap-2 rounded-2xl bg-raised px-4 py-3 font-medium">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-hi" aria-hidden /> {t.cancelled(w)}
        </p>
      ))}
      {/* few Zetteli: each one grows into the free space; many: comfortable fixed size */}
      <div className="flex flex-1 flex-col gap-5 short:gap-3">
        {draft.map((d, i) => {
          const c = checks[d.word.trim()];
          const r = c && c !== "loading" ? c : null;
          const fix = r?.corrected && r.corrected !== d.word.trim() ? r.corrected : "";
          return (
            <div
              key={i}
              ref={(el) => {
                slipEls.current[i] = el;
              }}
              className={`${draft.length <= 3 ? "flex max-h-72 min-h-40 flex-1 flex-col short:min-h-32 tiny:min-h-24" : ""} ${paths ? "into-bowl pointer-events-none" : ""}`}
              style={paths?.[i] ? ({ "--dx": `${paths[i].dx}px`, "--dy": `${paths[i].dy}px`, "--spin": `${i % 2 ? -30 : 25}deg`, animationDelay: `${i * 110}ms` } as CSSProperties) : undefined}
            >
              <Slip
                tilt={i % 2 ? 1.2 : -1.2}
                className={`unfold relative @container flex flex-col justify-center px-5 pt-5 pb-8 focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-accent ${draft.length <= 3 ? "flex-1" : ""}`}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <input
                  autoComplete="off"
                  maxLength={40}
                  value={d.word}
                  aria-label={t.slip(i + 1)}
                  placeholder={t.slip(i + 1)}
                  onChange={(e) => edit(i, { word: e.target.value })}
                  className="font-hand w-full bg-transparent pr-7 leading-tight font-bold outline-none placeholder:text-paper-ink/30"
                  style={fitLine(d.word || t.slip(i + 1), "3rem")}
                />
                {c === "loading" && <Loader2 className="absolute top-4 right-3 size-4 animate-spin text-paper-ink/40" aria-label={t.checking} />}
                <input
                  autoComplete="off"
                  maxLength={80}
                  value={d.hint}
                  aria-label={`${t.slip(i + 1)}: ${t.hintPh}`}
                  placeholder={t.hintPh}
                  onChange={(e) => edit(i, { hint: e.target.value })}
                  className="mt-2 w-full bg-transparent pb-1 text-base text-paper-ink/70 outline-none placeholder:text-paper-ink/30"
                />
              </Slip>
              {dupes.has(norm(d.word)) && <p className="mt-2 text-sm font-medium text-hi">{t.twice(d.word)}</p>}
              {(fix || r?.tooHard) && (
                <div aria-live="polite" className="pop mt-2 flex flex-wrap items-center gap-2 text-sm">
                  {fix && (
                    <button type="button" onClick={() => edit(i, { word: fix })} className={`flex items-center gap-1.5 rounded-2xl bg-raised px-3 py-1.5 text-left font-semibold ${press}`}>
                      <Sparkles className="size-4 text-accent" aria-hidden /> {t.didYouMean(fix)} <span className="text-accent">{t.useIt}</span>
                    </button>
                  )}
                  {r?.tooHard && (
                    <span className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-muted">
                      <AlertTriangle className="size-4 shrink-0 text-hi" aria-hidden /> {r.reason || t.tooHard}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Cta>
        {tossing ? (
          <div className="flex justify-center">
            <div ref={bowlEl} className="pop w-32">
              <div key={caught} className={caught ? "catch" : ""}>
                <Bowl />
              </div>
            </div>
          </div>
        ) : (
          <button disabled={busy || draft.some((d) => !norm(d.word)) || dupes.size > 0} className={btn}>
            {t.intoBowl}
          </button>
        )}
        <p className="mt-2 text-center text-sm text-muted tabular-nums">{t.done(v.done, v.players.length)}</p>
      </Cta>
    </form>
  );
}

/** topic in, three AI suggestions out; tapping one puts it on the next empty Zetteli */
function Ideas({ lang, avoid, full, onPick }: { lang: string; avoid: string[]; full: boolean; onPick: (w: string) => void }) {
  const t = useT();
  const aiRoom = useAiRoom();
  const [topic, setTopic] = useState("");
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const get = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/ai/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, lang, avoid, room: aiRoom }) }).then((x) => x.json());
      setIdeas(r?.ai && Array.isArray(r.words) && r.words.length ? r.words : []);
    } catch {
      setIdeas([]);
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="rounded-3xl bg-surface p-3" aria-label={t.ideas}>
      <div className="flex gap-2">
        <input
          value={topic}
          maxLength={60}
          autoComplete="off"
          aria-label={t.topicPh}
          placeholder={t.topicPh}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // not the Zetteli form
              get();
            }
          }}
          className="min-w-0 flex-1 rounded-2xl bg-canvas px-3 py-2.5 outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button type="button" onClick={get} disabled={loading} aria-label={t.getIdeas} className={`${btn2} w-auto! shrink-0 px-3 text-accent`}>
          {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Sparkles className="size-5" aria-hidden />}
        </button>
      </div>
      {ideas && ideas.length === 0 && <p className="mt-2 px-1 text-sm text-muted">{t.noIdeas}</p>}
      {ideas && ideas.length > 0 && (
        <div aria-live="polite" className="mt-3 flex flex-wrap gap-2">
          {ideas.map((w, i) => (
            <button key={w} type="button" disabled={full} onClick={() => { onPick(w); setIdeas((xs) => xs && xs.filter((x) => x !== w)); }} aria-label={t.pickIdea(w)} className={`${press} disabled:opacity-50`}>
              <Slip tilt={i % 2 ? 2 : -2} className="pop px-3 pt-1 pb-1">
                <span className="font-hand text-2xl font-bold">{w}</span>
              </Slip>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
