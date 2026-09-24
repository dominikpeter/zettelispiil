"use client";
import { useEffect, useState } from "react";
import type { View } from "./room";

/** ms left in the running turn (Infinity when none), ticking locally, corrected by the server clock offset */
export function useCountdown(v: View | null, offset: number) {
  const [now, setNow] = useState(0);
  const turning = v?.phase === "turn" && !v.pausedLeft;
  useEffect(() => {
    if (!turning) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [turning]);
  if (v?.pausedLeft) return v.pausedLeft; // frozen while paused
  return v && turning && now ? v.endsAt - (now + offset) : Infinity;
}
