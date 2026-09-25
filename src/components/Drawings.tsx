"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import type { Drawing, Stroke, View } from "@/lib/room";
import type { Dict } from "@/lib/i18n";
import { btn2, press } from "@/lib/ui";
import { Replay } from "./DrawBoard";

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

function Big({ code, d, word, by, t, onClose }: { code: string; d: Drawing; word: string; by: string; t: Dict; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const strokes = useSheet(code, d.sheet, true);
  const [play, setPlay] = useState(1);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current.close()} // tap outside closes
      aria-label={t.drawingOf(word)}
      className="sheet mx-auto mt-auto mb-0 max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-surface p-0 text-ink backdrop:bg-black/60 sm:mb-auto sm:rounded-3xl"
    >
      <div className="flex flex-col gap-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-hand text-3xl leading-tight font-bold break-words">{word}</h2>
            <p className="text-sm text-muted tabular-nums">
              {t.drawnBy(by)}, {outcome(d, t)}
            </p>
          </div>
          <button onClick={() => dialog.current?.close()} aria-label={t.close} className={`grid size-11 shrink-0 place-items-center rounded-full border border-line bg-raised ${press}`}>
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {strokes && <Replay strokes={strokes} label={t.drawingOf(word)} play={play} />}
        <button onClick={() => setPlay((n) => n + 1)} className={btn2}>
          <RotateCcw className="size-5" aria-hidden /> {t.replayAgain}
        </button>
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
        <Big key={open} code={code} d={drawings[open]} word={words[drawings[open].w] ?? "?"} by={by(drawings[open])} t={t} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}
