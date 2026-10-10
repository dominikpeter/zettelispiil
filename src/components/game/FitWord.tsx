"use client";
import { useLayoutEffect, useRef } from "react";
import { fitLine } from "@/lib/ui";

/** `fitLine`, then measured: wide letters (W, M) overshoot the per-letter guess, so shrink until the word really fits */
function useFit<T extends HTMLElement>(text: string, max?: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const e = ref.current;
    if (!e) return;
    const base = fitLine(text, max).fontSize as string;
    e.style.fontSize = base;
    if (e.scrollWidth > e.clientWidth) e.style.fontSize = `calc(${base} * ${(e.clientWidth / e.scrollWidth) * 0.97})`;
  }, [text, max]);
  return ref;
}

/** the handwritten word on a Zetteli: one line, as big as fits (needs an `@container` ancestor) */
export function FitWord({ text, max, as: Tag = "span", ...rest }: { text: string; max?: string; as?: "p" | "span"; className?: string; "data-testid"?: string }) {
  const ref = useFit<HTMLElement>(text, max);
  return (
    <Tag ref={ref as never} style={fitLine(text, max)} {...rest}>
      {text}
    </Tag>
  );
}
