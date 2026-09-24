"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import type { Stroke } from "@/lib/room";

export const INKS = ["#03071e", "#d62828", "#00679f", "#0a8a3a"];
const FLUSH_MS = 120; // drawer: how often new line pieces go out
const FAST_MS = 180; // watcher: poll interval while lines are coming in
const IDLE_MS = 700; // watcher: poll interval once the drawer pauses
const IDLE_AFTER = 8; // empty polls before slowing down

/** paint strokes, optionally only their first `limit` points (watchers reveal new lines gradually) */
function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], size: number, limit = Infinity) {
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = size / 110;
  let budget = limit;
  for (const st of strokes) {
    if (budget <= 0) break;
    ctx.strokeStyle = INKS[st[0]] ?? INKS[0];
    ctx.beginPath();
    for (let i = 1; i + 1 < st.length && budget > 0; i += 2, budget--) {
      const x = (st[i] / 1000) * size;
      const y = (st[i + 1] / 1000) * size;
      if (i === 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (st.length === 3) ctx.lineTo((st[1] / 1000) * size + 0.1, (st[2] / 1000) * size); // a dot
    ctx.stroke();
  }
}

const points = (ss: Stroke[]) => ss.reduce((n, s) => n + (s.length - 1) / 2, 0);

/** the paper: square, as large as the space it gets (the parent decides the size); keeps its pixels sharp */
function useFit(draw: (c: HTMLCanvasElement) => void) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const resized = useEffectEvent(() => canvas.current && draw(canvas.current));
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const fit = () => {
      const px = Math.round(c.clientWidth * (window.devicePixelRatio || 1));
      if (c.width !== px) c.width = c.height = px;
      resized();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  return { canvas, redraw: () => canvas.current && draw(canvas.current) };
}

const paper = "slip block aspect-square h-auto w-full touch-none rounded-md";

/** drawer: lines show at once and go out in small pieces; remount (new `key`) for a fresh sheet */
export function DrawPad({ ink, onFlush, label }: { ink: number; onFlush?: (s: Stroke[]) => void; label: string }) {
  const mine = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const pending = useRef<Stroke[]>([]);
  const lastFlushed = useRef(0); // coordinates of `current` already sent
  const { canvas, redraw } = useFit((c) => paint(c.getContext("2d")!, [...mine.current, ...(current.current ? [current.current] : [])], c.width));

  const send = useEffectEvent((batch: Stroke[]) => onFlush?.(batch));
  const drawer = !!onFlush;
  useEffect(() => {
    if (!drawer) return;
    const t = setInterval(() => {
      const cur = current.current;
      if (cur && cur.length - 1 > lastFlushed.current) {
        pending.current.push([cur[0], ...cur.slice(Math.max(1, lastFlushed.current - 1))]); // overlap one point so pieces join
        lastFlushed.current = cur.length - 1;
      }
      if (pending.current.length) {
        send(pending.current);
        pending.current = [];
      }
    }, FLUSH_MS);
    return () => clearInterval(t);
  }, [drawer]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = (v: number) => Math.max(0, Math.min(1000, Math.round(v * 1000)));
    return [k((e.clientX - r.left) / r.width), k((e.clientY - r.top) / r.height)];
  };

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      className={`${paper} ${onFlush ? "cursor-crosshair" : ""}`}
      style={{ clipPath: "none", paddingBottom: 0 }}
      onPointerDown={
        onFlush &&
        ((e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          current.current = [ink, ...at(e)];
          lastFlushed.current = 0;
          redraw();
        })
      }
      onPointerMove={
        onFlush &&
        ((e) => {
          const cur = current.current;
          if (!cur) return;
          const [x, y] = at(e);
          if (Math.abs(x - cur[cur.length - 2]) + Math.abs(y - cur[cur.length - 1]) < 5) return; // skip jitter, keeps payloads small
          cur.push(x, y);
          redraw();
        })
      }
      onPointerUp={
        onFlush &&
        (() => {
          const cur = current.current;
          if (cur && cur.length - 1 > lastFlushed.current) pending.current.push([cur[0], ...cur.slice(Math.max(1, lastFlushed.current - 1))]);
          if (cur) mine.current.push(cur);
          current.current = null;
        })
      }
    />
  );
}

/** watchers: pull only new lines, fast while the drawer draws, and trace them in smoothly */
export function DrawView({ code, sheet, label }: { code: string; sheet: number; label: string }) {
  const strokes = useRef<Stroke[]>([]);
  const shown = useRef(0); // points on screen so far
  const at = useRef({ sheet, from: 0 });
  const { canvas, redraw } = useFit((c) => paint(c.getContext("2d")!, strokes.current, c.width, shown.current));
  const repaint = useEffectEvent(() => redraw());

  // a newer sheet from the room (wipe, next Zetteli): start over there
  useEffect(() => {
    if (sheet <= at.current.sheet) return;
    at.current = { sheet, from: 0 };
    strokes.current = [];
    shown.current = 0;
  }, [sheet]);

  useEffect(() => {
    let alive = true;
    let idle = 0;
    let timer: ReturnType<typeof setTimeout>;
    const pull = async () => {
      try {
        const { sheet: s, from } = at.current;
        const r = await fetch(`/api/rooms/${code}/draw?sheet=${s}&from=${from}`, { cache: "no-store" }).then((x) => x.json());
        if (!alive || !Array.isArray(r?.strokes)) throw 0;
        if (r.sheet !== at.current.sheet) {
          strokes.current = [];
          shown.current = 0;
        }
        strokes.current.push(...r.strokes);
        at.current = { sheet: r.sheet, from: r.from + r.strokes.length };
        idle = r.strokes.length ? 0 : idle + 1;
      } catch {
        idle++;
      }
      if (alive) timer = setTimeout(pull, document.visibilityState === "visible" && idle < IDLE_AFTER ? FAST_MS : IDLE_MS);
    };
    pull();
    // trace new points over a few frames instead of popping them in
    let frame = 0;
    let painted = -1;
    const tick = () => {
      const total = points(strokes.current);
      if (shown.current > total) shown.current = total;
      if (shown.current < total) shown.current += Math.max(1, Math.ceil((total - shown.current) / 8));
      if (shown.current !== painted) {
        painted = shown.current;
        repaint();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      alive = false;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [code]); // one loop per mount; sheet changes go through `at`

  return <canvas ref={canvas} role="img" aria-label={label} className={paper} style={{ clipPath: "none", paddingBottom: 0 }} />;
}
