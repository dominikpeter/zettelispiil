"use client";

import { GripVertical } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useT } from "@/lib/prefs";
import type { RoundType } from "@/lib/room";
import { RoundIcon } from "@/lib/ui";

type ElRef = (el: Element | null) => void;

/** a round in the host's list; SortableRounds hands in the drag refs (handle: long-press on touch; keyboard: focus it, Space, arrow keys, Space) */
export function RoundRowView({ r, i, rowRef, handleRef, dragging = false, children }: { r: RoundType; i: number; rowRef?: ElRef; handleRef?: ElRef; dragging?: boolean; children: ReactNode }) {
  const t = useT();
  return (
    <li ref={rowRef} data-round={r} className={`enter flex items-center gap-2 rounded-2xl bg-raised py-1.5 pr-1 ${dragging ? "relative z-10 shadow-lg ring-2 ring-accent" : ""}`}>
      <button ref={handleRef} type="button" aria-label={t.moveRound(t.round[r].name)} className="flex min-w-0 flex-1 cursor-grab items-center gap-2 self-stretch rounded-xl pl-1.5 text-left select-none active:cursor-grabbing">
        <GripVertical className="size-4 shrink-0 text-muted max-xs:hidden" aria-hidden />
        <span className="w-3 shrink-0 text-sm font-bold text-muted tabular-nums">{i + 1}</span>
        <RoundIcon type={r} className="size-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate font-semibold">{t.round[r].name}</span>
      </button>
      {children}
    </li>
  );
}

// dnd-kit (~38 KB gzipped) is only for the host's round list: it loads on its own, never with the page itself
type Dnd = typeof import("./SortableRounds");
let dnd: Dnd | null = null;
let loading: Promise<Dnd> | null = null;
/** start loading the drag and drop code; the home page calls it as a host sets up a game, so the lobby has it at once */
export const loadDnd = () => (loading ??= import("./SortableRounds").then((m) => (dnd = m)));

/** the drag and drop code once it's there (null before, or when `on` is false) */
export function useDnd(on: boolean) {
  const [m, setM] = useState(dnd);
  useEffect(() => {
    if (on && !m) loadDnd().then(setM, () => {});
  }, [on, m]);
  return on ? (m ?? dnd) : null;
}
