"use client";

import { AlertTriangle, PenLine, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useAiRoom } from "@/lib/aiAccess";
import { useT } from "@/lib/prefs";
import { aiWordCount } from "@/lib/room";
import { aiZetteli } from "@/lib/roomClient";
import { Bowl, btn, btn2 } from "@/lib/ui";
import { Cta, Waiting, type P } from "./common";

/** "KI schreibt": the host's phone fetches every Zetteli and puts them in the bowl; nobody sees them. If the AI can't, the host switches to writing. */
export function AiWrite({ v, send, busy }: P) {
  const t = useT();
  const aiRoom = useAiRoom();
  const [failed, setFailed] = useState(false);
  const { perPlayer, topics, lang } = v.settings;
  const players = v.players.length;
  const write = useCallback(async () => {
    setFailed(false);
    const words = await aiZetteli(aiWordCount(players, perPlayer), topics, lang, aiRoom);
    if (words && words.length >= players) await send({ type: "fill", words });
    setFailed(true); // still here: nothing came back, or the bowl refused it (this screen is gone once it's filled)
  }, [players, perPlayer, topics, lang, aiRoom, send]);
  const asked = useRef(false); // once per write phase, also when React runs effects twice
  useEffect(() => {
    if (!v.isHost || asked.current) return;
    asked.current = true;
    write();
  }, [v.isHost, write]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="relative h-40 w-48">
          {!failed &&
            [0, 1, 2].map((i) => (
              <span
                key={i}
                className="fall mini-slip absolute top-6 h-8 w-12"
                style={{ left: `${30 + i * 18}%`, animationDelay: `${i * 0.5}s`, "--r0": `${-20 + i * 15}deg`, "--r1": `${10 - i * 12}deg` } as CSSProperties}
              />
            ))}
          <Bowl className="absolute bottom-0 left-1/2 w-40 -translate-x-1/2" />
        </div>
        {failed ? (
          <p role="alert" className="pop flex items-start gap-2 rounded-2xl bg-raised px-4 py-3 text-left font-medium">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-hi" aria-hidden /> {t.aiFailed}
          </p>
        ) : (
          <>
            <h2 className="text-3xl font-extrabold tracking-tight text-balance">{t.aiWriting}</h2>
            <p className="text-muted">{t.aiWritingHelp}</p>
          </>
        )}
      </div>
      <Cta>
        {failed && v.isHost ? (
          <div className="flex flex-col gap-2">
            <button onClick={() => send({ type: "selfWrite" })} disabled={busy} className={btn}>
              <PenLine className="size-5" aria-hidden /> {t.sourcePlayers}
            </button>
            <button onClick={write} disabled={busy} className={btn2}>
              <RotateCw className="size-4" aria-hidden /> {t.tryAgain}
            </button>
          </div>
        ) : (
          <Waiting text={t.soon} />
        )}
      </Cta>
    </div>
  );
}
