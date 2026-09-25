"use client";

import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
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
