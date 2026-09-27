"use client";

import { Plus, Smartphone, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ScanCode } from "@/components/ScanCode";
import { AiNameButton } from "@/components/game/common"; // not the Game barrel: that pulls every game screen into the home page
import { loadDnd } from "@/components/game/RoundRow";
import { InstallHint } from "@/components/InstallHint";
import { TopControls } from "@/components/TopControls";
import { loadLocalGame, loadPlayers, newLocalGame, savePlayers, subscribePlayers } from "@/lib/localGame";
import { langPref, useT } from "@/lib/prefs";
import { api, errKey, funnyName, saveIdentity, type Identity } from "@/lib/roomClient";
import { aimDrops } from "@/lib/heroDrop";
import { Bowl, btn, btn2, field, fieldBtn, ghost, panel, press, scrollBehavior, Slip } from "@/lib/ui";

const noop = () => () => {};
const hasLocalGame = () => !!loadLocalGame();
const NO_PLAYERS: string[] = [];

// fanned out above the bowl so every word stays readable; back row first, smaller
const HERO = [
  // first in the pile, so painted behind the rest: it lands in the bowl behind the big one in the middle
  { w: "Schoggi", tilt: -6, x: "left-[3%] top-0", size: "text-lg", d: "0s", drop: { "--slot": -0.15, "--rot": "9deg" } },
  { w: "Gipfeli", tilt: 6, x: "right-[3%] top-[1%]", size: "text-lg", d: "0.08s", drop: { "--slot": 0.25, "--rot": "-10deg" } },
  // in the bowl (bowl: true, placed within the bowl's own box, so they stay inside it at any phone width): small ones
  // fanned out from its middle, their lower part hidden behind its front
  { w: "Aare", tilt: -9, x: "right-1/2 translate-x-0.5 bottom-[50%]", size: "text-sm", pad: "px-2 pt-1", d: "0.16s", bowl: true },
  { w: "Rösti", tilt: 8, x: "left-1/2 -translate-x-0.5 bottom-[48%]", size: "text-sm", pad: "px-2 pt-1", d: "0.22s", bowl: true },
  { w: "Fondue", tilt: -9, x: "left-0 top-[17%]", size: "text-2xl", d: "0.3s", drop: { "--slot": -0.45, "--rot": "14deg" } },
  { w: "Velo", tilt: 9, x: "right-1 top-[16%]", size: "text-2xl", d: "0.38s", drop: { "--slot": 0.45, "--rot": "-15deg" } },
  // the front of the pile in the bowl: fills the gap between the mid-level pair above and the small pair, so it doesn't look sparse
  { w: "Chuchi", tilt: -4, x: "left-[13%] bottom-[46%]", size: "text-base", d: "0.42s", bowl: true },
  { w: "Glocke", tilt: 5, x: "right-[11%] bottom-[46%]", size: "text-base", d: "0.44s", bowl: true },
  // centred with margins, not a translate: the toss animates translate
  { w: "Matterhorn", tilt: 2, x: "inset-x-0 mx-auto w-fit top-[6%]", size: "text-[1.55rem]", d: "0.46s", drop: { "--slot": -0.05, "--rot": "-6deg" } },
];

const heroSlip = (h: (typeof HERO)[number], word: string, i: number) => (
  <Slip
    key={i}
    tilt={h.tilt}
    className={`unfold absolute ${"pad" in h ? h.pad : "px-3.5 pt-1.5"} ${h.x} ${"drop" in h ? "drop-in" : ""} ${"bowl" in h ? "sway" : ""}`}
    style={{
      // the swaying ones each on their own beat and direction, so the pile never moves in step
      animationDelay: `${h.d}, ${"drop" in h ? 0 : -((i * 1.3) % 4.5)}s`,
      ...("drop" in h ? h.drop : {}),
      ...("bowl" in h ? { "--sway": i % 2 ? "-1deg" : "1.2deg" } : {}),
    }}
  >
    <span className={`font-hand font-bold whitespace-nowrap ${h.size}`}>{word}</span>
  </Slip>
);

// the words on the hero slips: a fresh Swiss mix on every visit (the server renders the classic set, then the phone shuffles).
// Side slips take up to 7 letters, the big one in the middle up to 10, so every word fits its spot.
const SHORT = [
  "Schoggi", "Gipfeli", "Aare", "Rösti", "Fondue", "Velo", "Brötli", "Hörnli", "Zopf", "Zmorge", "Znüni", "Alphorn", "Gondel", "Rivella", "Chuchi", "Müesli", "Lädeli", "Bärli", "Fähre", "Glocke", "Arosa", "Aarau", "Rüebli", "Chalet", "Grüezi", "Skilift", "Schnee",
  // biking, winter sports, partying, cheese and Jass: the same Swiss mix, just a wider pantry
  "Bike", "Trail", "Helm", "Firn", "Skitag", "Chilbi", "Ausgang", "Beiz", "Chäs", "Gruyère", "Jass", "Trumpf", "Weis", "Stöck",
  // a bit more dialect: none of these need explaining if you grew up here
  "Mungg", "Güsel", "Gugus", "Stürmi", "Glünggi", "Bise", "Gfrörli", "Gstürm", "Pfnüsel",
];
const LONG = [
  "Matterhorn", "Jungfrau", "Pilatus", "Gotthard", "Säntis", "Zytglogge", "Raclette", "Bergbahn", "Eiger", "Rheinfall", "Weisshorn", "Bärenland", "Maienzug", "Schlitten", "Rüeblimärt", "Tschuggen",
  "Bikepark", "Skigebiet", "Jugendfest", "Käsefondue", "Emmentaler", "Jasstisch",
  "Tschäderi", "Chrüsimüsi", "Bäredräck",
];
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
  const heroRef = useRef<HTMLDivElement>(null);
  // re-aim when the words change (server set → shuffled), once the handwriting font is in (it sets slip widths), and on resize
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const aim = () => aimDrops(el);
    aim();
    document.fonts.ready.then(aim);
    const ro = new ResizeObserver(aim);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hero]);
  const resumable = useSyncExternalStore(noop, hasLocalGame, () => false);
  const [name, setName] = useState(""); // empty: you type your name, or tap the sparkle for a funny one
  const players = useSyncExternalStore(subscribePlayers, loadPlayers, () => NO_PLAYERS);
  const named = players.map((p, i) => p.trim() || t.playerN(i + 1));
  const [play, setPlay] = useState<"local" | "online">("local");
  const [mode, setMode] = useState<"create" | "join">("create");
  const codeRef = useRef<HTMLInputElement>(null);
  // "Raum beitreten": the code field showed up below the fold, behind the start button. Bring it (and the scan button
  // next to it) into view and put the cursor there, so it's obvious: type the code or scan it
  useEffect(() => {
    if (play !== "online" || mode !== "join") return; // also when coming back to "Mehrere Handys" with join still picked
    codeRef.current?.focus({ preventScroll: true });
    codeRef.current?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
  }, [mode, play]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const go = async (path: string, body: object) => {
    setBusy(true);
    if (!path) loadDnd(); // a new room: the host's lobby will want to drag rounds, so fetch that code while the room is made
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
    loadDnd(); // the lobby's round list, fetched while the game is set up
    await newLocalGame(named, lang);
    router.push("/local");
  };
  const ready = !busy && (play === "local" ? players.length >= 4 : !!name.trim() && (mode === "create" || code.length >= 4));

  const choice = (on: boolean) => `flex flex-col items-start gap-1 rounded-2xl border-2 p-3 text-left ${press} ${on ? "border-accent bg-raised" : "border-line"}`;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-3">
      {/* sticky: settings stay a thumb away while the player list scrolls. No band behind it: the pill floats on its own
          (it has its own blurred background). pointer-events-none: the header's full width must not block taps on what
          scrolls under it; the pill and the coffee toast (DOM children of TopControls) opt back in */}
      <header className="sticky top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 -mx-4 flex min-h-[calc(2.75rem+2px)] items-center justify-end px-4 pointer-events-none">
        <TopControls />
      </header>
      {/* a few slips are tossed into the bowl on scroll: aimDrops measures where each one lands */}
      <div ref={heroRef} className="relative mt-4 h-44" aria-hidden>
        {HERO.map((h, i) => !("bowl" in h) && heroSlip(h, hero[i], i))}
        {/* the bowl's own box: the slips in it are placed against the bowl, and it paints over them (relative, after them) */}
        <div className="absolute bottom-0 left-1/2 w-52 -translate-x-1/2">
          {HERO.map((h, i) => "bowl" in h && heroSlip(h, hero[i], i))}
          <Bowl pile={false} className="relative w-full" />
        </div>
      </div>

      <h1 translate="no" className="mt-3 text-[2.75rem] leading-[0.95] font-extrabold tracking-tight text-hi">Zettelispiil</h1>
      <p className="mt-2 max-w-[36ch] text-muted">{t.tagline}</p>
      <div className="mt-4 empty:hidden">
        <InstallHint />
      </div>

      <form
        className="mt-5 flex flex-1 flex-col gap-4"
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
              <span key={String(play === o)} className={play === o ? "pop" : ""}>
                {o === "local" ? <Smartphone className="size-6 text-accent" aria-hidden /> : <Users className="size-6 text-accent" aria-hidden />}
              </span>
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
                    onChange={(e) => savePlayers(players.map((x, j) => (j === i ? e.target.value : x)))}
                    className="min-w-0 flex-1 rounded-lg bg-transparent px-1 py-3 text-lg font-semibold outline-none placeholder:text-muted/60 focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-accent/30"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <AiNameButton
                    label={`${t.playerN(i + 1)}: ${t.aiName}`}
                    make={() => funnyName("player", lang, players, t.funnyPlayers, null, players[i], t.namePrefixes)}
                    onName={(n) => savePlayers(loadPlayers().map((x, j) => (j === i ? n : x)))} // the list as it is when the name arrives
                    className={`grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-raised hover:text-accent ${press}`}
                  />
                  <button type="button" onClick={() => savePlayers(players.filter((_, j) => j !== i))} aria-label={t.removePlayer(named[i])} className={`grid size-10 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink ${press}`}>
                    <X className="size-5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => savePlayers([...players, ""])}
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
          <input aria-label={t.yourName} className={`${field} min-w-0 flex-1 font-semibold`} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.yourName} maxLength={24} autoComplete="nickname" autoCorrect="off" spellCheck={false} />
          <AiNameButton label={t.aiName} make={() => funnyName("player", lang, [name], t.funnyPlayers, null, name, t.namePrefixes)} onName={setName} className={fieldBtn} />
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
                  ref={codeRef}
                  value={code}
                  maxLength={6}
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

        {/* fixed, not the shared sticky Cta: the home page's content above (install banner, many players) can run past
            one screen, and sticky-in-a-flex-column only stays glued to the bottom while everything still fits one
            viewport (it works fine on every in-game screen, which are all short); fixed always pins to the viewport */}
        <div className="fixed inset-x-0 bottom-0 z-20 cta-fade pt-9 short:pt-3 tiny:pt-2">
          <div className="mx-auto max-w-md px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
            <div className="flex flex-col gap-2">
              <button key={String(ready)} className={`${btn} ${ready ? "hop" : ""}`} disabled={!ready}>
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
            </div>
          </div>
        </div>
        {/* the fixed bar's own height, so it never covers the form's last field; taller when the resume button also shows
            (it was a fixed h-24 guess sized for one button, so a resumable local game's extra row got cut off) */}
        <div aria-hidden className={play === "local" && resumable ? "h-40" : "h-24"} />
      </form>
    </main>
  );
}
