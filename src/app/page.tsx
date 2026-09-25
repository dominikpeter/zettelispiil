"use client";

import { Plus, Smartphone, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { ScanCode } from "@/components/ScanCode";
import { AiNameButton } from "@/components/Game";
import { TopControls } from "@/components/TopControls";
import { loadLocalGame, loadPlayers, newLocalGame } from "@/lib/localGame";
import { langPref, useT } from "@/lib/prefs";
import { api, errKey, funnyName, saveIdentity, type Identity } from "@/lib/roomClient";
import { Bowl, btn, btn2, field, ghost, panel, press, Slip } from "@/lib/ui";

const noop = () => () => {};
const hasLocalGame = () => !!loadLocalGame();
let savedPlayers: string[] | undefined;
const playersSnapshot = () => (savedPlayers ??= loadPlayers());
const NO_PLAYERS: string[] = [];

// fanned out above the bowl so every word stays readable; back row first, smaller
const HERO = [
  { w: "Schoggi", tilt: -6, x: "left-[3%] top-0 max-xs:hidden", size: "text-lg", d: "0s" },
  { w: "Gipfeli", tilt: 6, x: "right-[3%] top-[1%]", size: "text-lg", d: "0.08s" },
  // these two are in the bowl: small, fanned out from its middle, their lower part hidden behind its front
  { w: "Aare", tilt: -9, x: "right-1/2 translate-x-0.5 bottom-[31%]", size: "text-sm", pad: "px-2 pt-1", d: "0.16s" },
  { w: "Rösti", tilt: 8, x: "left-1/2 -translate-x-0.5 bottom-[29%]", size: "text-sm", pad: "px-2 pt-1", d: "0.22s" },
  { w: "Fondue", tilt: -9, x: "left-0 top-[28%]", size: "text-2xl", d: "0.3s" },
  { w: "Velo", tilt: 9, x: "right-1 top-[27%]", size: "text-2xl", d: "0.38s" },
  { w: "Matterhorn", tilt: 2, x: "left-1/2 -translate-x-1/2 top-[6%]", size: "text-[1.55rem]", d: "0.46s" },
];

// the words on the hero slips: a fresh Swiss mix on every visit (the server renders the classic set, then the phone shuffles).
// Side slips take up to 7 letters, the big one in the middle up to 10, so every word fits its spot.
const SHORT = ["Schoggi", "Gipfeli", "Aare", "Rösti", "Fondue", "Velo", "Brötli", "Hörnli", "Zopf", "Zmorge", "Znüni", "Alphorn", "Gondel", "Rivella", "Chuchi", "Müesli", "Lädeli", "Bärli", "Fähre", "Glocke", "Arosa", "Aarau", "Rüebli", "Chalet", "Grüezi", "Skilift", "Schnee"];
const LONG = ["Matterhorn", "Jungfrau", "Pilatus", "Gotthard", "Säntis", "Zytglogge", "Raclette", "Bergbahn", "Eiger", "Rheinfall", "Weisshorn", "Bärenland", "Maienzug", "Schlitten", "Rüeblimärt", "Tschuggen"];
const CLASSIC = HERO.map((h) => h.w);
let heroWords: string[] | null = null;
const randomHero = () =>
  (heroWords ??= (() => {
    const short = SHORT.map((w) => [Math.random(), w] as const).sort((x, y) => x[0] - y[0]).map(([, w]) => w);
    return HERO.map((_, i) => (i === HERO.length - 1 ? LONG[Math.floor(Math.random() * LONG.length)] : short[i]));
  })());

export default function Home() {
  const t = useT();
  const lang = langPref.use();
  const router = useRouter();
  const hero = useSyncExternalStore(noop, randomHero, () => CLASSIC);
  const resumable = useSyncExternalStore(noop, hasLocalGame, () => false);
  const [name, setName] = useState(""); // empty: you type your name, or tap the sparkle for a funny one
  const savedList = useSyncExternalStore(noop, playersSnapshot, () => NO_PLAYERS);
  const [edited, setPlayers] = useState<string[] | null>(null);
  const players = edited ?? savedList;
  const named = players.map((p, i) => p.trim() || t.playerN(i + 1));
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
    await newLocalGame(named, lang);
    router.push("/local");
  };
  const ready = !busy && (play === "local" ? players.length >= 4 : !!name.trim() && (mode === "create" || code.length >= 4));

  const choice = (on: boolean) => `flex flex-col items-start gap-1 rounded-2xl border-2 p-3 text-left ${press} ${on ? "border-accent bg-raised" : "border-line"}`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex justify-end">
        <TopControls />
      </header>
      <div className="relative mt-4 h-44" aria-hidden>
        {HERO.map((h, i) => (
          <Slip key={i} tilt={h.tilt} className={`unfold absolute ${"pad" in h ? h.pad : "px-3.5 pt-1.5"} ${h.x}`} style={{ animationDelay: h.d }}>
            <span className={`font-hand font-bold whitespace-nowrap ${h.size}`}>{hero[i]}</span>
          </Slip>
        ))}
        <Bowl pile={false} className="absolute bottom-0 left-1/2 w-36 -translate-x-1/2" /> {/* the two slips above are its pile */}
      </div>

      <h1 translate="no" className="mt-3 text-[2.75rem] leading-[0.95] font-extrabold tracking-tight text-hi">Zettelispiil</h1>
      <p className="mt-2 max-w-[36ch] text-muted">{t.tagline}</p>

      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          if (play === "local") startLocal();
          else if (mode === "create") go("", { name, lang });
          else join();
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          {(["local", "online"] as const).map((o) => (
            <button key={o} type="button" onClick={() => setPlay(o)} aria-pressed={play === o} className={choice(play === o)}>
              {o === "local" ? <Smartphone className="size-6 text-accent" aria-hidden /> : <Users className="size-6 text-accent" aria-hidden />}
              <span className="font-semibold">{o === "local" ? t.onePhone : t.everyPhone}</span>
              <span className="text-sm leading-snug text-muted">{o === "local" ? t.onePhoneHelp : t.everyPhoneHelp}</span>
            </button>
          ))}
        </div>

        {play === "local" && (
          <section key="players" className={`${panel} enter py-3`}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold">{t.players}</h2>
              <span key={players.length} className="pop text-muted tabular-nums">
                {players.length}
              </span>
            </div>
            <ul className="mt-1 flex flex-col">
              {players.map((p, i) => (
                <li key={i} className="enter flex items-center gap-2 border-b border-line last:border-0">
                  <input
                    value={p}
                    maxLength={24}
                    autoFocus={i === players.length - 1 && !p} // a freshly added row: type right away
                    aria-label={t.playerN(i + 1)}
                    placeholder={t.playerN(i + 1)}
                    onChange={(e) => setPlayers(players.map((x, j) => (j === i ? e.target.value : x)))}
                    className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-3 text-lg font-semibold outline-none placeholder:text-muted/60 focus-visible:bg-raised"
                    autoComplete="off"
                  />
                  <AiNameButton
                    label={`${t.playerN(i + 1)}: ${t.aiName}`}
                    make={() => funnyName("player", lang, players, t.funnyPlayers, null, players[i], t.namePrefixes)}
                    onName={(n) => setPlayers((ps) => (ps ?? players).map((x, j) => (j === i ? n : x)))}
                    className={`grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-raised hover:text-accent ${press}`}
                  />
                  <button type="button" onClick={() => setPlayers(players.filter((_, j) => j !== i))} aria-label={t.removePlayer(named[i])} className={`grid size-10 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink ${press}`}>
                    <X className="size-5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setPlayers([...players, ""])}
              disabled={players.length >= 20}
              className={`${ghost} -ml-3 mt-1 flex items-center gap-2 text-accent`}
            >
              <Plus className="size-5" aria-hidden /> {t.addPlayer}
            </button>
          </section>
        )}

        {play === "online" && (
          <div key="online" className="enter flex flex-col gap-3">
            <div className="flex gap-2">
          <input aria-label={t.yourName} className={`${field} min-w-0 flex-1 font-semibold`} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.yourName} maxLength={24} autoComplete="nickname" />
          <AiNameButton label={t.aiName} make={() => funnyName("player", lang, [name], t.funnyPlayers, null, name, t.namePrefixes)} onName={setName} className={`grid size-[3.4rem] shrink-0 place-items-center rounded-2xl border border-line bg-surface text-accent ${press}`} />
        </div>


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
                  maxLength={5}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
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
          {busy ? t.wait : play === "local" ? (players.length >= 4 ? t.newGame : t.needFour) : mode === "create" ? t.createRoom : t.join}
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
