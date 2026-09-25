"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import type { Stroke } from "@/lib/room";

export const INKS = ["#03071e", "#d62828", "#00679f", "#0a8a3a"];
const FLUSH_MS = 120; // drawer: how often new line pieces go out
const FAST_MS = 250; // watcher: poll interval while lines are coming in (tracing hides the gaps)
const IDLE_MS = 700; // watcher: poll interval once the drawer pauses
const IDLE_AFTER = 8; // empty polls before slowing down
const PACE_MS = FAST_MS + 80; // watcher: a batch is traced evenly over about the time until the next one lands, so the pen never stops
const CATCH_UP_MS = 400; // …but a big backlog (joined late, back from a pause) is drawn in quickly

/**
 * draw strokes (up to `limit` points in all) as soft curves through the midpoints of their samples, so a few points
 * still look hand-drawn. A stroke cut off by `limit` ends at a midpoint: revealing the next point only extends it,
 * nothing already on screen moves. Returns where the pen is.
 */
function ink(ctx: CanvasRenderingContext2D, strokes: Stroke[], size: number, limit = Infinity) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = size / 110;
  let budget = limit;
  let pen: [number, number, string] | null = null;
  for (const st of strokes) {
    if (budget <= 0) break;
    const color = INKS[st[0]] ?? INKS[0];
    const all = (st.length - 1) / 2;
    const n = Math.min(all, budget);
    budget -= n;
    const X = (k: number) => (st[1 + 2 * k] / 1000) * size;
    const Y = (k: number) => (st[2 + 2 * k] / 1000) * size;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    if (all === 1) ctx.lineTo(X(0) + 0.1, Y(0)); // a dot
    for (let k = 1; k < n - 1; k++) ctx.quadraticCurveTo(X(k), Y(k), (X(k) + X(k + 1)) / 2, (Y(k) + Y(k + 1)) / 2);
    const whole = n === all;
    if (whole && n > 1) ctx.lineTo(X(n - 1), Y(n - 1));
    ctx.stroke();
    pen = whole || n < 3 ? [X(n - 1), Y(n - 1), color] : [(X(n - 2) + X(n - 1)) / 2, (Y(n - 2) + Y(n - 1)) / 2, color];
  }
  return pen;
}

/** the whole paper at once (drawer, and watchers after a resize) */
function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], size: number) {
  ctx.clearRect(0, 0, size, size);
  ink(ctx, strokes, size);
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

/**
 * drawer: lines show at once and go out in small pieces. Remount (new `key`) for the next Zetteli.
 * On mount it reloads what's already on the sheet (after a pause or a reload).
 * `wipeNo` going up clears the paper at once; new lines wait until the room's `sheet` has moved on, so none get lost.
 */
export function DrawPad({ ink, onFlush, label, code, sheet, wipeNo }: { ink: number; onFlush?: (sheet: number, s: Stroke[]) => void; label: string; code: string; sheet: number; wipeNo: number }) {
  const mine = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const pending = useRef<Stroke[]>([]);
  const lastFlushed = useRef(0); // coordinates of `current` already sent
  const target = useRef({ sheet, wipeNo, hold: false }); // where new lines go; `hold` while a wipe is on its way
  const { canvas, redraw } = useFit((c) => paint(c.getContext("2d")!, [...mine.current, ...(current.current ? [current.current] : [])], c.width));
  const repaint = useEffectEvent(() => redraw());

  // back after a pause or a reload: what the others already see
  useEffect(() => {
    let alive = true;
    fetch(`/api/rooms/${code}/draw?sheet=${sheet}&from=0`, { cache: "no-store" })
      .then((x) => x.json())
      .then((r) => {
        if (!alive || r?.sheet !== sheet || !Array.isArray(r.strokes) || !r.strokes.length) return;
        mine.current = [...r.strokes, ...mine.current];
        repaint();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once per sheet mount

  // wipe: clear now, hold new lines until the room has opened the next sheet
  useEffect(() => {
    if (wipeNo === target.current.wipeNo) return;
    target.current = { sheet: target.current.sheet, wipeNo, hold: true };
    mine.current = [];
    pending.current = [];
    repaint();
  }, [wipeNo]);
  useEffect(() => {
    if (sheet !== target.current.sheet) target.current = { ...target.current, sheet, hold: false };
  }, [sheet]);

  const send = useEffectEvent((batch: Stroke[]) => onFlush?.(target.current.sheet, batch));
  const drawer = !!onFlush;
  useEffect(() => {
    if (!drawer) return;
    const t = setInterval(() => {
      const cur = current.current;
      if (cur && cur.length - 1 > lastFlushed.current) {
        pending.current.push([cur[0], ...cur.slice(Math.max(1, lastFlushed.current - 1))]); // overlap one point so pieces join
        lastFlushed.current = cur.length - 1;
      }
      if (pending.current.length && !target.current.hold) {
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
  const total = useRef(0); // points received so far (kept as a running sum, not recounted every frame)
  const shown = useRef(0); // points on screen so far (fractional while tracing)
  const deadline = useRef(0); // when the points received so far should all be on screen
  const at = useRef({ sheet, from: 0, gen: 0 }); // gen bumps on every reset, so late answers for an old sheet are dropped
  // lines already fully on screen, drawn once onto a stored image; each frame only adds the line being traced
  const baked = useRef<{ img: HTMLCanvasElement; strokes: number; points: number } | null>(null);
  const reset = () => {
    strokes.current = [];
    total.current = shown.current = 0;
    baked.current = null;
  };
  const { canvas, redraw } = useFit((c) => {
    const ctx = c.getContext("2d")!;
    const size = c.width;
    const limit = Math.floor(shown.current);
    let b = baked.current;
    if (!b || b.img.width !== size) {
      const img = document.createElement("canvas");
      img.width = img.height = size;
      b = baked.current = { img, strokes: 0, points: 0 };
    }
    for (let st = strokes.current[b.strokes]; st && b.points + (st.length - 1) / 2 <= limit; st = strokes.current[b.strokes]) {
      ink(b.img.getContext("2d")!, [st], size);
      b.strokes++;
      b.points += (st.length - 1) / 2;
    }
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(b.img, 0, 0);
    const pen = ink(ctx, strokes.current.slice(b.strokes), size, limit - b.points);
    if (pen && shown.current < total.current) {
      // the pen tip while a line is traced in: it feels live
      ctx.fillStyle = pen[2];
      ctx.beginPath();
      ctx.arc(pen[0], pen[1], ctx.lineWidth * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const repaint = useEffectEvent(() => redraw());

  // a newer sheet from the room (wipe, next Zetteli): start over there
  useEffect(() => {
    if (sheet <= at.current.sheet) return;
    at.current = { sheet, from: 0, gen: at.current.gen + 1 };
    reset();
  }, [sheet]);

  useEffect(() => {
    let alive = true;
    let idle = 0;
    let timer: ReturnType<typeof setTimeout>;
    const pull = async () => {
      try {
        const { sheet: s, from, gen } = at.current;
        const r = await fetch(`/api/rooms/${code}/draw?sheet=${s}&from=${from}`, { cache: "no-store" }).then((x) => x.json());
        if (!alive || !Array.isArray(r?.strokes)) throw 0;
        if (gen !== at.current.gen) throw 0; // the sheet changed while this was on its way
        if (r.sheet !== s) reset();
        strokes.current.push(...r.strokes);
        total.current += points(r.strokes);
        if (r.strokes.length) deadline.current = performance.now() + PACE_MS;
        at.current = { sheet: r.sheet, from: r.from + r.strokes.length, gen: r.sheet !== s ? gen + 1 : gen };
        idle = r.strokes.length ? 0 : idle + 1;
      } catch {
        idle++;
      }
      if (alive) timer = setTimeout(pull, document.visibilityState === "visible" && idle < IDLE_AFTER ? FAST_MS : IDLE_MS);
    };
    pull();
    // trace new points at a steady pace until the next batch lands: the pen keeps moving, like watching live, a moment behind
    let frame = 0;
    let painted = -1;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, now - last);
      last = now;
      const all = total.current;
      if (shown.current > all) shown.current = all;
      const left = all - shown.current;
      if (left > 0) {
        const time = Math.min(Math.max(16, deadline.current - now), left > 300 ? CATCH_UP_MS : Infinity);
        shown.current = Math.min(all, shown.current + Math.max(left * (dt / time), 0.25));
      }
      const key = Math.floor(shown.current) * 2 + (shown.current < all ? 1 : 0); // repaint when a point or the pen dot changes
      if (key !== painted) {
        painted = key;
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
