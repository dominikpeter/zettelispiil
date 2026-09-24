"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import type { Stroke } from "@/lib/room";

export const INKS = ["#03071e", "#d62828", "#00679f", "#0a8a3a"];
const FLUSH_MS = 250; // how often the drawer's new lines go to the server

function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[], size: number) {
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = size / 110;
  for (const st of strokes) {
    ctx.strokeStyle = INKS[st[0]] ?? INKS[0];
    ctx.beginPath();
    for (let i = 1; i + 1 < st.length; i += 2) {
      const x = (st[i] / 1000) * size;
      const y = (st[i + 1] / 1000) * size;
      if (i === 1) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (st.length === 3) ctx.lineTo((st[1] / 1000) * size + 0.1, (st[2] / 1000) * size); // a dot
    ctx.stroke();
  }
}

/**
 * The drawing paper. Viewers pass `strokes` (from the server) and just watch.
 * The drawer passes `onFlush`: its own lines live on this phone (seeded from `strokes` after a reload)
 * and go to the server in small batches. Remount with a new `key` for a fresh sheet.
 */
export function DrawBoard({ strokes, ink = 0, onFlush, label }: { strokes: Stroke[]; ink?: number; onFlush?: (s: Stroke[]) => void; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mine = useRef<Stroke[]>(strokes); // drawer: everything drawn on this sheet
  const current = useRef<Stroke | null>(null);
  const pending = useRef<Stroke[]>([]);
  const lastFlushed = useRef(0); // how many points of `current` were already sent

  const redraw = () => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    paint(ctx, onFlush ? [...mine.current, ...(current.current ? [current.current] : [])] : strokes, c.width);
  };

  // keep the canvas sharp at any size
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const fit = () => {
      const px = Math.round(c.clientWidth * (window.devicePixelRatio || 1));
      if (c.width !== px) c.width = c.height = px;
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  });

  // drawer: send the latest bits every few hundred ms, continuing lines where they left off
  const send = useEffectEvent((batch: Stroke[]) => onFlush?.(batch)); // latest callback without restarting the timer
  const drawer = !!onFlush;
  useEffect(() => {
    if (!drawer) return;
    const t = setInterval(() => {
      const cur = current.current;
      if (cur && cur.length - 1 > lastFlushed.current) {
        const from = Math.max(1, lastFlushed.current - 1); // overlap one point so segments join
        pending.current.push([cur[0], ...cur.slice(from)]);
        lastFlushed.current = cur.length - 1;
      }
      if (pending.current.length) {
        const batch = pending.current;
        pending.current = [];
        send(batch);
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
      className={`slip aspect-square w-full touch-none rounded-md ${onFlush ? "cursor-crosshair" : ""}`}
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
          if (Math.abs(x - cur[cur.length - 2]) + Math.abs(y - cur[cur.length - 1]) < 6) return; // skip jitter, keeps payloads small
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
