"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { BackButton, GameMenu, Lobby, PassPhone, Phase, Score, Waiting } from "@/components/Game";
import { TopControls } from "@/components/TopControls";
import { localStore } from "@/lib/localStore";
import { useT } from "@/lib/prefs";
import { act, joinRoom, view, type Action, type View } from "@/lib/room";
import { useCountdown } from "@/lib/useCountdown";
import { loadLocalGame, saveLocalGame, type LocalGame } from "@/lib/localGame";

const noop = () => () => {};

/** who holds the phone right now: the host between rounds and while the AI writes, each writer in turn, the describer during turns */
async function viewerOf(g: LocalGame): Promise<{ v: View; who: number }> {
  const host = await view(localStore, g.code, g.ids[0].pid, g.ids[0].token);
  if (host.phase === "write" && host.settings.source !== "ai") {
    for (let i = 0; i < g.ids.length; i++) {
      const v = await view(localStore, g.code, g.ids[i].pid, g.ids[i].token);
      if (!v.iDone) return { v, who: i };
    }
  }
  if ((host.phase === "ready" || host.phase === "turn") && host.active !== null) {
    const a = g.ids[host.active];
    return { v: await view(localStore, g.code, a.pid, a.token), who: host.active };
  }
  return { v: host, who: 0 };
}

export default function LocalGamePage() {
  const t = useT();
  const router = useRouter();
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const [game, setGame] = useState<LocalGame | null>(() => (typeof window === "undefined" ? null : loadLocalGame()));
  const [v, setV] = useState<View | null>(null);
  const [who, setWho] = useState(0);
  const [confirmed, setConfirmed] = useState<string | null>(null); // "write-<player>" once they took the phone
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!game) return;
    try {
      const r = await viewerOf(game);
      setV(r.v);
      setWho(r.who);
    } catch {
      setGame(null); // game expired or storage cleared
    }
  }, [game]);

  // the room logic settles timeouts on read, so keep reading while a turn runs
  const phase = v?.phase;
  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = phase === "turn" ? setInterval(refresh, 400) : undefined;
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh, phase]);

  const left = useCountdown(v, 0);

  useEffect(() => {
    if (hydrated && !game) router.replace("/");
  }, [hydrated, game, router]);

  const send = async (a: Action, as?: number) => {
    if (!game) return;
    setBusy(true);
    const p = game.ids[as ?? who];
    try {
      await act(localStore, game.code, p.pid, p.token, a);
      if (a.type === "kick") {
        const next = { ...game, ids: game.ids.filter((_, i) => i !== a.player) };
        saveLocalGame(next);
        setGame(next);
      }
    } catch {} // an out-of-turn tap: nothing to do
    await refresh();
    setBusy(false);
  };

  const add = async (name: string) => {
    if (!game) return;
    setBusy(true);
    try {
      const r = await joinRoom(localStore, game.code, name);
      const next = { ...game, ids: [...game.ids, { pid: r.pid, token: r.token }] };
      saveLocalGame(next);
      setGame(next);
    } catch {}
    setBusy(false);
  };

  if (!hydrated || !game) return <main className="flex-1" />;

  const playing = v && v.phase !== "lobby" && v.phase !== "write" && v.phase !== "end";
  const gateKey = v?.phase === "write" && v.settings.source !== "ai" ? `write-${who}-${v.settings.perPlayer}-${v.myWrite?.cancelled.length ?? 0}` : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <header className="mb-4 flex min-h-11 items-center justify-between gap-2">
        <BackButton v={v} onLeave={() => router.push("/")} />
        {v && v.phase !== "lobby" && v.phase !== "end" ? (
          <div className="flex items-center gap-2">
            {playing && <Score v={v} />}
            <GameMenu v={v} send={send} mode="local" onLeave={() => router.push("/")} />
          </div>
        ) : (
          <TopControls />
        )}
      </header>

      {!v && <Waiting text={t.loading} />}
      {v?.phase === "lobby" && <Lobby v={v} send={send} busy={busy} mode="local" onAdd={add} />}
      {v && gateKey && confirmed !== gateKey && (
        <PassPhone key={gateKey} name={v.players[who].name} team={v.players[who].team} teamName={v.teamNames[v.players[who].team]} note={v.myWrite?.cancelled.length ? t.cancelled(v.myWrite.cancelled.at(-1)!) : t.writeSecret} onReady={() => setConfirmed(gateKey)} />
      )}
      {v && v.phase !== "lobby" && (!gateKey || confirmed === gateKey) && <Phase key={`${v.phase}-${who}`} v={v} send={send} busy={busy} mode="local" left={left} />}
    </main>
  );
}
