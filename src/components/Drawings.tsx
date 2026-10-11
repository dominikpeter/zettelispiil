"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Share2, X } from "lucide-react";
import type { Drawing, Stroke, View } from "@/lib/room";
import type { Dict } from "@/lib/i18n";
import { btn2, openSheet, press, round_btn, whatsappHref } from "@/lib/ui";
import { drawingPng, INKS, Replay } from "./DrawBoard";

const fmt = (ms: number) => (ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

// one fetch per sheet, shared by the thumbnail and the big replay
const sheets = new Map<string, Promise<Stroke[]>>();
const loadSheet = (code: string, sheet: number) => {
  const key = `${code}:${sheet}`;
  let p = sheets.get(key);
  if (!p) {
    p = fetch(`/api/rooms/${code}/draw?sheet=${sheet}&exact=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then((r) => (Array.isArray(r?.strokes) ? (r.strokes as Stroke[]) : []));
    p.catch(() => sheets.delete(key)); // try again next time
    sheets.set(key, p);
  }
  return p;
};

/** the strokes of a sheet, fetched once `load` is true (visible or tapped) */
function useSheet(code: string, sheet: number, load: boolean) {
  const [strokes, setStrokes] = useState<Stroke[] | null>(null);
  useEffect(() => {
    if (!load) return;
    let alive = true;
    loadSheet(code, sheet).then((s) => alive && setStrokes(s), () => {});
    return () => {
      alive = false;
    };
  }, [code, sheet, load]);
  return strokes;
}

const EMPTY: Stroke[] = [];
const outcome = (d: Drawing, t: Dict) => (d.got ? t.guessedIn(fmt(d.ms)) : t.notGuessed);

function Thumb({ code, d, word, by, t, onOpen }: { code: string; d: Drawing; word: string; by: string; t: Dict; onOpen: () => void }) {
  const box = useRef<HTMLButtonElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (setSeen(true), io.disconnect()), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const strokes = useSheet(code, d.sheet, seen);
  return (
    <li>
      <button ref={box} onClick={onOpen} className={`flex w-full flex-col gap-1.5 rounded-2xl text-left ${press}`}>
        <Replay strokes={strokes ?? EMPTY} label={t.drawingOf(word)} />
        <span className="font-hand truncate px-1 text-xl leading-tight font-bold">{word}</span>
        <span className="truncate px-1 text-xs text-muted">{t.drawnBy(by)}</span>
        <span className={`px-1 text-xs tabular-nums ${d.got ? "text-ink" : "text-muted"}`}>{outcome(d, t)}</span>
      </button>
    </li>
  );
}

/** the numbers behind one drawing: strokes, pace, colours, and its time next to every other drawing of the game */
function DrawStats({ strokes, d, all, words, t }: { strokes: Stroke[]; d: Drawing; all: Drawing[]; words: string[]; t: Dict }) {
  const pts = strokes.reduce((n, s) => n + (s.length - 1) / 2, 0);
  const mix = INKS.map((_, i) => strokes.reduce((n, s) => n + (s[0] === i ? (s.length - 1) / 2 : 0), 0));
  const top = Math.max(...all.map((x) => x.ms), 1);
  const cell = "rounded-2xl bg-raised p-3";
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className={cell}><dd className="text-xl font-bold tabular-nums">{fmt(d.ms)} s</dd><dt className="text-xs text-muted">{t.drawTime}</dt></div>
        <div className={cell}><dd className="text-xl font-bold tabular-nums">{strokes.length}</dd><dt className="text-xs text-muted">{t.drawStrokes}</dt></div>
        <div className={cell}><dd className="text-xl font-bold tabular-nums">{d.ms ? Math.round((strokes.length * 60000) / d.ms) : 0}</dd><dt className="text-xs text-muted">{t.drawPace}</dt></div>
      </dl>
      {pts > 0 && (
        <div>
          <h3 className="text-sm font-semibold">{t.drawInk}</h3>
          <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-raised" title={t.drawInk}>
            {mix.map((n, i) => n > 0 && <span key={i} style={{ width: `${(n / pts) * 100}%`, background: INKS[i] }} />)}
          </div>
        </div>
      )}
      {all.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold">{t.drawCompare}</h3>
          <ul className="mt-1.5 flex flex-col gap-1">
            {all.map((x) => (
              <li key={x.sheet} className="flex items-center gap-2 text-xs">
                <span className={`w-20 shrink-0 truncate ${x.sheet === d.sheet ? "font-bold" : "text-muted"}`}>{words[x.w] ?? "?"}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-raised">
                  <span className={`block h-full rounded-full ${x.sheet === d.sheet ? "bg-accent" : "bg-muted/50"} ${x.got ? "" : "opacity-50"}`} style={{ width: `${(x.ms / top) * 100}%` }} />
                </span>
                <span className="w-12 shrink-0 text-right tabular-nums">{fmt(x.ms)} s</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Big({ code, d, word, by, t, all, words, onClose }: { code: string; d: Drawing; word: string; by: string; t: Dict; all: Drawing[]; words: string[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const strokes = useSheet(code, d.sheet, true);
  const [play, setPlay] = useState(1);
  useEffect(() => {
    openSheet(dialog.current);
  }, []);
  // the picture goes out through the phone's share sheet (WhatsApp is in it); no link, the drawing stays in the room.
  // A browser that can't share files gets a WhatsApp message with the facts instead.
  const text = t.shareDrawingText(word, by, outcome(d, t));
  const shareIt = async () => {
    try {
      const png = strokes && (await drawingPng(strokes, word));
      const file = png && new File([png], "zettelispiil.png", { type: "image/png" });
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else window.open(whatsappHref(text), "_blank", "noopener");
    } catch {} // closing the share sheet throws AbortError: nothing to do
  };
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current.close()} // tap outside closes
      aria-label={t.drawingOf(word)}
      className="sheet mx-auto mt-auto mb-0 max-h-sheet w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-surface p-0 text-ink backdrop:bg-black/60 sm:mb-auto sm:rounded-3xl"
    >
      <div className="flex flex-col gap-4 p-5 pb-safe-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-hand text-3xl leading-tight font-bold break-words">{word}</h2>
            <p className="text-sm text-muted tabular-nums">
              {t.drawnBy(by)}, {outcome(d, t)}
            </p>
          </div>
          <button onClick={() => dialog.current?.close()} aria-label={t.close} className={`${round_btn} shrink-0`}>
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {strokes && <Replay strokes={strokes} label={t.drawingOf(word)} play={play} />}
        <button onClick={() => setPlay((n) => n + 1)} className={btn2}>
          <RotateCcw className="size-5" aria-hidden /> {t.replayAgain}
        </button>
        <button onClick={shareIt} disabled={!strokes} className={btn2}>
          <Share2 className="size-5" aria-hidden /> {t.shareDrawing}
        </button>
        {strokes && <DrawStats strokes={strokes} d={d} all={all} words={words} t={t} />}
      </div>
    </dialog>
  );
}

/** end stats, several phones: every drawing of the game; tap one to watch it being drawn again */
export function Drawings({ code, drawings, words, players, t }: { code: string; drawings: Drawing[]; words: string[]; players: View["players"]; t: Dict }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!drawings.length) return null;
  const by = (d: Drawing) => players[d.p]?.name ?? "?";
  return (
    <section className="enter rounded-3xl bg-surface p-5">
      <h2 className="text-lg font-bold">{t.drawings}</h2>
      <p className="mt-0.5 text-sm text-muted">{t.drawingsNote}</p>
      <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">
        {drawings.map((d, i) => (
          <Thumb key={`${d.sheet}`} code={code} d={d} word={words[d.w] ?? "?"} by={by(d)} t={t} onOpen={() => setOpen(i)} />
        ))}
      </ul>
      {open !== null && drawings[open] && (
        <Big key={open} code={code} d={drawings[open]} word={words[drawings[open].w] ?? "?"} by={by(drawings[open])} t={t} all={drawings} words={words} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}
