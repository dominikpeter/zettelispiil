"use client";

import { Smartphone } from "lucide-react";
import { useT } from "@/lib/prefs";
import { type Team } from "@/lib/room";
import { Bowl, btn, ghost, panel, TEAM } from "@/lib/ui";
import { Stats } from "../Stats";
import { Waiting, Cta, RoundCard, type P } from "./common";

/** one-phone games: hand the phone over before anything secret shows */
export function PassPhone({ name, team, teamName, onReady, note }: { name: string; team: Team; teamName: string; onReady: () => void; note?: string }) {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <span className={`pop grid size-24 place-items-center rounded-4xl tiny:size-18 ${TEAM[team].soft}`}>
          <Smartphone className={`size-12 tiny:size-9 ${TEAM[team].text}`} strokeWidth={1.75} aria-hidden />
        </span>
        <p className="enter mt-2 text-lg text-muted">{t.passTo}</p>
        <h1 className={`enter text-6xl font-extrabold tracking-tight text-balance break-words tiny:text-5xl ${TEAM[team].text}`}>{name}</h1>
        <p className="enter text-muted">{teamName}</p>
        {note && <p className="enter mt-4 max-w-[30ch] text-muted">{note}</p>}
      </div>
      <Cta>
        <button onClick={onReady} className={btn}>
          {t.iAm(name)}
        </button>
      </Cta>
    </div>
  );
}

export function Ready({ v, send, busy, mode }: P) {
  const t = useT();
  const d = v.active!;
  const p = v.players[d];
  const me = d === v.me;
  const local = mode === "local";
  const last = v.lastTurn && v.lastTurn.r === v.round ? v.lastTurn : null;
  const carry = Math.round(v.carryMs / 1000);
  return (
    <div className="flex flex-1 flex-col gap-4 short:gap-2 tiny:gap-1">
      <RoundCard v={v} n={v.round} mode={mode} className="enter" />
      {last && (
        <p aria-live="polite" className="pop self-center rounded-full bg-surface px-4 py-2 text-center tiny:py-1 tiny:text-sm">
          {t.gotLast(v.players[last.p].name, last.got)}
        </p>
      )}
      <div className="enter flex flex-1 flex-col items-center justify-center gap-2 text-center [animation-delay:120ms]">
        <Bowl count={v.bowlLeft} className="w-28 short:w-20 tiny:w-14" />
        <p className="mt-3 text-muted short:mt-1">{local ? t.passTo : me ? t.yourTurn : t.upNext}</p>
        <h1 className={`text-5xl font-extrabold tracking-tight break-words short:text-4xl tiny:text-3xl ${TEAM[p.team].text}`}>{me && !local ? t.youBang : p.name}</h1>
        <p className="text-muted">
          {t.forTeam(v.teamNames[p.team])}
          {carry > 0 && `, ${t.carry(carry)}`}
        </p>
      </div>
      <Cta>
        {me ? (
          <button onClick={() => send({ type: "go" }, d)} disabled={busy} className={btn}>
            {t.go}
          </button>
        ) : (
          <Waiting text={v.players[v.me]?.team === p.team ? t.youGuess(p.name) : t.youListen(p.name)} />
        )}
        {v.isHost && (
          <button onClick={() => send({ type: "pass" })} disabled={busy} className={`${ghost} w-full text-sm tiny:min-h-9`}>
            {t.notHere(p.name)}
          </button>
        )}
      </Cta>
    </div>
  );
}

export function RoundEnd({ v, send, busy, mode }: P) {
  const t = useT();
  const r = v.scores[v.round];
  const many = v.teamNames.length > 2; // three or four columns: smaller type so they fit a 320 px phone
  const carry = Math.round(v.carryMs / 1000);
  const starter = v.lastTurn ? v.players[v.lastTurn.p] : null;
  return (
    <div className="flex flex-1 flex-col gap-4 short:gap-2">
      <div className="pop flex flex-col items-center gap-2 pt-4 text-center short:gap-1 short:pt-0">
        <Bowl count={0} className="w-28 short:w-20 tiny:w-14" />
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight short:mt-0 short:text-3xl tiny:text-2xl">{t.bowlEmpty}</h1>
        <p className="text-muted tiny:hidden">{t.roundDone(t.round[v.settings.rounds[v.round]].name)}</p>
      </div>
      <section className={`${panel} enter grid gap-3 text-center short:py-3 tiny:py-2 [animation-delay:100ms] ${many ? "max-xs:gap-1.5 max-xs:px-3" : ""}`} style={{ gridTemplateColumns: `repeat(${v.teamNames.length}, minmax(0, 1fr))` }}>
        {v.teamNames.map((name, i) => (
          <div key={i} className="min-w-0">
            <p className={`truncate font-semibold ${TEAM[i].text} ${many ? "text-sm" : ""}`}>{name}</p>
            <p className={`font-extrabold tabular-nums ${many ? "text-3xl short:text-2xl" : "text-4xl short:text-3xl tiny:text-2xl"}`}>+{r[i] ?? 0}</p>
          </div>
        ))}
      </section>
      <RoundCard v={v} n={v.round + 1} mode={mode} className="enter [animation-delay:200ms]" />
      {starter && carry > 0 && <p className="enter text-center text-muted tiny:text-sm [animation-delay:260ms]">{t.starts(starter.name, carry)}</p>}
      <Cta>
        {v.isHost ? (
          <button onClick={() => send({ type: "nextRound" })} disabled={busy} className={btn}>
            {t.startRound(v.round + 2)}
          </button>
        ) : (
          <Waiting text={t.hostNextRound(v.players[v.hostIndex]?.name ?? "")} />
        )}
      </Cta>
    </div>
  );
}

export function End({ v, send, busy, mode }: P) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <Stats v={v} showMe={mode === "online"} />
      <Cta>
        {v.isHost ? (
          <button onClick={() => send({ type: "lobby" })} disabled={busy} className={btn}>
            {t.again}
          </button>
        ) : (
          <Waiting text={t.hostAgain(v.players[v.hostIndex]?.name ?? "")} />
        )}
      </Cta>
    </div>
  );
}
