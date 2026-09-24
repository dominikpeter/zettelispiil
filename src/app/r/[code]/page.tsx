"use client";

import { X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Lobby, Phase, Score, Waiting } from "@/components/Game";
import { TopControls } from "@/components/TopControls";
import { useT } from "@/lib/prefs";
import type { Action, View } from "@/lib/room";
import { api, errKey, loadIdentity, loadName, saveIdentity, saveName, type Identity } from "@/lib/roomClient";
import { Bowl, btn, btn2, field, ghost } from "@/lib/ui";
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

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="mb-4 flex min-h-11 items-center justify-between gap-2">
        <button
          onClick={() => (!joined || v?.phase === "lobby" || v?.phase === "end" || confirm(t.leaveConfirm)) && router.push("/")}
          aria-label={t.leave}
          className={`${ghost} -ml-3 flex items-center gap-1.5`}
        >
          <X className="size-5" aria-hidden />
          <span className="font-bold tracking-[0.2em] text-ink">{code}</span>
        </button>
        {playing ? <Score v={v} /> : <TopControls />}
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
            <input autoFocus value={name} maxLength={24} autoComplete="nickname" placeholder={t.yourName} aria-label={t.yourName} onChange={(e) => setName(e.target.value)} className={`${field} text-center font-semibold`} />
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

      {joined && v.phase === "lobby" && <Lobby v={v} send={send} busy={busy} mode="online" share={{ qr, copied, onShare: share }} />}
      {joined && v.phase !== "lobby" && <Phase v={v} send={send} busy={busy} mode="online" left={left} />}

      {!v && !errMsg && <Waiting text={t.loading} />}
    </main>
  );
}
