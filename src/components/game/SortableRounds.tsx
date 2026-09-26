"use client";

import { move } from "@dnd-kit/helpers";
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import type { ReactNode } from "react";
import type { RoundType } from "@/lib/room";
import { RoundRowView } from "./RoundRow";

// loaded on demand by useDnd (RoundRow.tsx): everything here pulls in dnd-kit

export function SortableRow({ r, i, children }: { r: RoundType; i: number; children: ReactNode }) {
  const { ref, handleRef, isDragging } = useSortable({ id: r, index: i });
  return (
    <RoundRowView r={r} i={i} rowRef={ref} handleRef={handleRef} dragging={isDragging}>
      {children}
    </RoundRowView>
  );
}

export function Sortable({ rounds, onOrder, children }: { rounds: RoundType[]; onOrder: (rounds: RoundType[]) => void; children: ReactNode }) {
  return (
    <DragDropProvider
      onDragEnd={(e) => {
        if (!e.canceled) onOrder(move(rounds, e));
      }}
    >
      {children}
    </DragDropProvider>
  );
}

// one-phone lobby: players dragged between the team boxes by their grip (the name next to it stays tappable, to rename)
export function TeamsDnd({ onMove, children }: { onMove: (player: number, team: number) => void; children: ReactNode }) {
  return (
    <DragDropProvider
      onDragEnd={(e) => {
        const from = e.operation.source?.id, to = e.operation.target?.id;
        if (!e.canceled && typeof from === "string" && typeof to === "string" && from.startsWith("player-") && to.startsWith("team-"))
          onMove(Number(from.slice(7)), Number(to.slice(5)));
      }}
    >
      {children}
    </DragDropProvider>
  );
}

export function TeamDrop({ team, className, children }: { team: number; className: string; children: ReactNode }) {
  const { ref, isDropTarget } = useDroppable({ id: `team-${team}` });
  return (
    <div ref={ref} className={`${className} transition-shadow ${isDropTarget ? "ring-2 ring-accent" : ""}`}>
      {children}
    </div>
  );
}

export function PlayerDrag({ player, className, children }: { player: number; className: string; children: (handle: (el: Element | null) => void) => ReactNode }) {
  const { ref, handleRef, isDragging } = useDraggable({ id: `player-${player}` });
  return (
    <li ref={ref} className={`${className} ${isDragging ? "relative z-10 rounded-xl bg-surface shadow-lg" : ""}`}>
      {children(handleRef)}
    </li>
  );
}
