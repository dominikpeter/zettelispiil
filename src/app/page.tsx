"use client";

import { Dices, Smartphone, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { ScanCode } from "@/components/ScanCode";
import { TopControls } from "@/components/TopControls";
import { DICT, pickOne } from "@/lib/i18n";
import { loadLocalGame, newLocalGame } from "@/lib/localGame";
import { langPref, useT } from "@/lib/prefs";
import { api, errKey, loadName, saveIdentity, saveName, type Identity } from "@/lib/roomClient";
import { Bowl, btn, btn2, field, press, Slip } from "@/lib/ui";

const noop = () => () => {};
// saved name, or a funny one to start from; picked once so the snapshot stays stable
let suggestion: string | undefined;
const suggestedName = () => (suggestion ??= loadName() || pickOne(DICT[langPref.get()].funnyPlayers));
const hasLocalGame = () => !!loadLocalGame();

// fanned out above the bowl so every word stays readable
const HERO = [
  { w: "Fondue", tilt: -8, x: "left-0 top-[24%]", d: "0.05s" },
  { w: "Matterhorn", tilt: 3, x: "left-1/2 -translate-x-1/2 top-0", d: "0.15s" },
  { w: "Velo", tilt: 8, x: "right-1 top-[22%]", d: "0.25s" },
];

export default function Home() {
  const t = useT();
  const lang = langPref.use();
  const router = useRouter();
  const saved = useSyncExternalStore(noop, suggestedName, () => "");
  const resumable = useSyncExternalStore(noop, hasLocalGame, () => false);
  const [typed, setName] = useState<string | null>(null);
  const name = typed ?? saved;
  const [play, setPlay] = useState<"local" | "online">("local");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const go = async (path: string, body: object) => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<Identity & { code: string }>(path, body);
      saveName(name.trim());
      saveIdentity(r.code, { pid: r.pid, token: r.token });
      router.push(`/r/${r.code}`);
    } catch (e) {
      setErr(t[errKey((e as Error).message)]);
      setBusy(false);
    }
  };
  const join = (c = code) => go(`/${c}`, { type: "join", name });
  const startLocal = async () => {
    setBusy(true);
    saveName(name.trim());
    await newLocalGame(name.trim(), lang);
    router.push("/local");
  };
  const ready = !!name.trim() && !busy && (play === "local" || mode === "create" || code.length === 4);

  const choice = (on: boolean) => `flex flex-col items-start gap-1 rounded-2xl border-2 p-3 text-left ${press} ${on ? "border-accent bg-raised" : "border-line"}`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-3 pb-6">
      <header className="flex justify-end">
        <TopControls />
      </header>
      <div className="relative mt-2 h-48" aria-hidden>
        {HERO.map((h) => (
          <Slip key={h.w} tilt={h.tilt} className={`unfold absolute px-4 pt-2 ${h.x}`} style={{ animationDelay: h.d }}>
            <span className="font-hand text-[1.7rem] font-bold whitespace-nowrap">{h.w}</span>
          </Slip>
        ))}
        <Bowl className="absolute bottom-0 left-1/2 w-44 -translate-x-1/2" />
      </div>

      <h1 className="mt-4 text-[3.25rem] leading-[0.95] font-extrabold tracking-tight text-hi">Zettelispiil</h1>
      <p className="mt-3 max-w-[34ch] text-lg text-muted">{t.tagline}</p>

      <form
        className="mt-7 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          if (play === "local") startLocal();
          else if (mode === "create") go("", { name, lang });
          else join();
        }}
      >
        <div className="flex gap-2">
          <input aria-label={t.yourName} className={`${field} min-w-0 flex-1 font-semibold`} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.yourName} maxLength={24} autoComplete="nickname" />
          <button type="button" onClick={() => setName(pickOne(t.funnyPlayers.filter((n) => n !== name)))} aria-label={t.otherName} className={`grid size-[3.4rem] shrink-0 place-items-center rounded-2xl border border-line bg-surface ${press}`}>
            <Dices className="size-6" aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(["local", "online"] as const).map((o) => (
            <button key={o} type="button" onClick={() => setPlay(o)} aria-pressed={play === o} className={choice(play === o)}>
              {o === "local" ? <Smartphone className="size-6 text-accent" aria-hidden /> : <Users className="size-6 text-accent" aria-hidden />}
              <span className="font-semibold">{o === "local" ? t.onePhone : t.everyPhone}</span>
              <span className="text-sm leading-snug text-muted">{o === "local" ? t.onePhoneHelp : t.everyPhoneHelp}</span>
            </button>
          ))}
        </div>

        {play === "online" && (
          <div key="online" className="enter flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              {(["create", "join"] as const).map((o) => (
                <button key={o} type="button" onClick={() => setMode(o)} aria-pressed={mode === o} className={choice(mode === o)}>
                  <span className="font-semibold">{o === "create" ? t.newRoom : t.joinRoom}</span>
                  <span className="text-sm leading-snug text-muted">{o === "create" ? t.newRoomHelp : t.joinRoomHelp}</span>
                </button>
              ))}
            </div>
            {mode === "join" && (
              <div key="join" className="enter flex items-center gap-2">
                <input
                  value={code}
                  maxLength={4}
                  autoCapitalize="characters"
                  autoComplete="off"
                  aria-label={t.roomCode}
                  placeholder={t.roomCode}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  className={`${field} min-w-0 flex-1 text-center text-2xl font-bold tracking-[0.4em] uppercase placeholder:text-lg placeholder:font-normal placeholder:tracking-normal placeholder:normal-case`}
                />
                <ScanCode
                  labels={{ scan: t.scan, pointCamera: t.pointCamera, noCamera: t.noCamera, close: t.close }}
                  onCode={(c) => {
                    setCode(c);
                    if (name.trim()) join(c);
                  }}
                />
              </div>
            )}
          </div>
        )}

        <button className={btn} disabled={!ready}>
          {busy ? t.wait : play === "local" ? t.newGame : mode === "create" ? t.createRoom : t.join}
        </button>
        {play === "local" && resumable && (
          <button type="button" onClick={() => router.push("/local")} className={btn2}>
            {t.resume}
          </button>
        )}
        {err && (
          <p role="alert" className="enter text-center font-medium text-hi">
            {err}
          </p>
        )}
      </form>
    </main>
  );
}
