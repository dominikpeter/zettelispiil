"use client";

import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AiNameButton, BackButton, GameMenu, Lobby, Phase, Score, Waiting } from "@/components/Game";
import { TopControls } from "@/components/TopControls";
import { AiRoomContext, useAiStatus } from "@/lib/aiAccess";
import { langPref, useT } from "@/lib/prefs";
import type { Action, Stroke, View } from "@/lib/room";
import { api, errKey, funnyName, loadIdentity, loadName, saveIdentity, saveName, type Identity } from "@/lib/roomClient";
import { Bowl, btn, btn2, field } from "@/lib/ui";
import { useCountdown } from "@/lib/useCountdown";

const noop = () => () => {};
const POLL_MS = 1500;
const POLL_TURN_MS = 800;

export default function Room() {
  const t = useT();
  const code = useParams<{ code: string }>().code.toUpperCase();
  const router = useRouter();
  // server + hydration render nothing, so localStorage-derived state never mismatches
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const [id, setId] = useState<Identity | null>(() => (typeof window === "undefined" ? null : loadIdentity(code)));
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState("");
  // the name you used last time; the sparkle suggests a funny one
  const [name, setName] = useState(() => (typeof window === "undefined" ? "" : loadName()));
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [offset, setOffset] = useState(0); // server clock − my clock

  const url = typeof window === "undefined" ? "" : `${location.origin}/r/${code}`;

  const refresh = useCallback(async () => {
    try {
      const next = await api<View>(`/${code}`, undefined, id);
      setOffset(next.now - Date.now());
      setV(next);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [code, id]);

  const fast = v?.phase === "turn" || v?.phase === "ready";

  // poll while visible; refresh right away when the phone wakes up
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && refresh();
    const first = setTimeout(refresh, 0); // always load once, even if opened in a background tab
    const timer = setInterval(tick, fast ? POLL_TURN_MS : POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh, fast]);

  const left = useCountdown(v, offset);

  // the host is signed in (maybe only since opening the room): turn AI on for everyone here, once
  const signedIn = !!useAiStatus()?.user;
  const claim = !!v?.isHost && !v.ai && signedIn && !!id;
  useEffect(() => {
    if (claim) api(`/${code}`, { ...id, type: "claimAi" }).then(refresh, () => {});
  }, [claim, code, id, refresh]);

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: "#0c0014", light: "#fffcd6" } }).then(setQr, () => {});
  }, [url]);

  const send = async (body: Action) => {
    setBusy(true);
    try {
      await api(`/${code}`, { ...id, ...body });
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // drawer: new line pieces straight to the drawing channel; a lost piece is not worth an error
  const live = {
    code,
    draw: (sheet: number, strokes: Stroke[]) => {
      api(`/${code}/draw`, { ...id, sheet, strokes }).catch(() => {});
    },
  };

  const join = async () => {
    setBusy(true);
    try {
      const r = await api<Identity>(`/${code}`, { type: "join", name });
      saveIdentity(code, r);
      saveName(name.trim());
      setId({ pid: r.pid, token: r.token });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    try {
      if (navigator.share) return await navigator.share({ title: "Zettelispiil", text: t.shareText(code), url });
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {} // user cancelled the share sheet
  };

  if (!hydrated) return <main className="flex-1" />;

  const joined = !!v && v.me >= 0;
  const players = v?.players ?? [];
  const errMsg = err && err !== "forbidden" ? t[errKey(err)] : "";
  const playing = v && v.phase !== "lobby" && v.phase !== "write" && v.phase !== "end";
  // a signed-in host opened this room: AI is on for everyone who joined
  const aiRoom = joined && v.ai && id ? { code, pid: id.pid, token: id.token } : null;

  return (
    <AiRoomContext value={aiRoom}>
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <header className="mb-4 flex min-h-11 items-center justify-between gap-2">
        <BackButton v={v} onLeave={() => router.push("/")} label={code} />
        {joined && v.phase !== "lobby" && v.phase !== "end" ? (
          <div className="flex items-center gap-2">
            {playing && <Score v={v} />}
            <GameMenu v={v} send={send} mode="online" onLeave={() => router.push("/")} />
          </div>
        ) : (
          <TopControls />
        )}
      </header>

      {errMsg && (
        <p role="alert" className="enter mb-4 rounded-2xl bg-raised px-4 py-3 text-center font-medium text-hi">
          {errMsg}
        </p>
      )}
      {!v && (err === "not_found" || err === "no_storage") && (
        <button onClick={() => router.push("/")} className={`${btn2} w-auto self-center`}>
          {t.home}
        </button>
      )}

      {/* join form: new visitor via link or QR */}
      {v && !joined && v.phase === "lobby" && (
        <div key="join" className="enter flex flex-1 flex-col justify-center gap-4 text-center">
          <Bowl className="mx-auto w-32" />
          <p className="text-muted">{t.invites(players[v.hostIndex]?.name ?? "")}</p>
          <h1 className="text-4xl font-extrabold tracking-tight">{t.playAlong}</h1>
          <p className="text-3xl font-bold tracking-[0.3em] text-hi">{code}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
            className="mt-2 flex flex-col gap-3"
          >
            <div className="flex gap-2">
              <input value={name} maxLength={24} autoComplete="nickname" placeholder={t.yourName} aria-label={t.yourName} onChange={(e) => setName(e.target.value)} className={`${field} min-w-0 flex-1 text-center font-semibold`} />
              <AiNameButton
                label={t.aiName}
                make={() => funnyName("player", langPref.get(), [name], t.funnyPlayers)}
                onName={setName}
                className="grid size-[3.4rem] shrink-0 place-items-center rounded-2xl border border-line bg-surface text-accent"
              />
            </div>
            <button disabled={busy || !name.trim()} className={btn}>
              {t.join}
            </button>
          </form>
        </div>
      )}

      {v && !joined && v.phase !== "lobby" && (
        <div className="enter flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <Bowl className="w-32" />
          <p className="text-lg">{t.started}</p>
          <button onClick={() => router.push("/")} className={`${btn2} w-auto`}>
            {t.home}
          </button>
        </div>
      )}

      {joined && v.phase === "lobby" && <Lobby v={v} send={send} busy={busy} mode="online" share={{ qr, copied, onShare: share, url }} />}
      {joined && v.phase !== "lobby" && <Phase v={v} send={send} live={live} busy={busy} mode="online" left={left} />}

      {!v && !errMsg && <Waiting text={t.loading} />}
    </main>
    </AiRoomContext>
  );
}
