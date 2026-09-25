"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/prefs";
import type { View } from "@/lib/room";
import { buzz } from "@/lib/ui";
import { End, Ready, RoundEnd } from "./game/Between";
import type { P } from "./game/common";
import { AiWrite } from "./game/AiWrite";
import { Turn } from "./game/Turn";
import { Write } from "./game/Write";

// every game screen lives in ./game; pages import them from here
export { AiNameButton, Cta, Waiting, type Live, type Mode, type Send } from "./game/common";
export { BackButton, GameMenu, Score } from "./game/Header";
export { Lobby } from "./game/Lobby";
export { PassPhone } from "./game/Between";
export { End, Ready, RoundEnd, Turn, Write };

/** a guessed Zetteli flashes on every phone except the one that scored it */
function GotFlash({ v }: { v: View }) {
  const t = useT();
  const g = v.lastGot;
  const [seen, setSeen] = useState(g?.n ?? 0); // no flash for what was guessed before this screen opened
  const [shown, setShown] = useState<typeof g>(null);
  if (g && g.n !== seen) {
    setSeen(g.n);
    if (g.by !== v.me) setShown(g);
  }
  useEffect(() => {
    if (!shown) return;
    buzz(15);
    const h = setTimeout(() => setShown(null), 1800);
    return () => clearTimeout(h);
  }, [shown]);
  if (!shown) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))] z-40 flex justify-center px-4">
      <p key={shown.n} className="pop flex max-w-full items-center gap-2 rounded-full bg-cta px-4 py-2 font-bold text-cta-ink shadow-xl">
        <Check className="size-5 shrink-0" aria-hidden />
        <span className="truncate">
          {t.got}: <span className="font-hand text-2xl leading-none">{shown.text}</span>
        </span>
      </p>
    </div>
  );
}

/** every phase of a running game; lobby and joining are handled by the page */
export function Phase(props: P & { left: number }) {
  const { v } = props;
  const body =
    v.phase === "write" && v.settings.source === "ai" ? <AiWrite key="ai" {...props} />
    : v.phase === "write" ? <Write key={`w${v.settings.perPlayer}-${v.me}-${v.myWrite?.cancelled.length ?? 0}`} {...props} />
    : v.phase === "ready" ? <Ready key={`r${v.turnNo}-${v.round}`} {...props} />
    : v.phase === "turn" ? <Turn key={`t${v.turnNo}`} {...props} />
    : v.phase === "roundEnd" ? <RoundEnd {...props} />
    : v.phase === "end" ? <End {...props} />
    : null;
  return (
    <>
      {props.mode === "online" && v.phase !== "write" && <GotFlash v={v} />}
      {body}
    </>
  );
}
