"use client";

import { ArrowLeftRight, Check, Sparkles, Crown, GripVertical, Infinity as Inf, Minus, Pencil, Plus, Share2, Shuffle, UserPlus, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move as moved } from "@dnd-kit/helpers";
import { useAiOn, useAiRoom } from "@/lib/aiAccess";
import { useT } from "@/lib/prefs";
import { LANGS } from "@/lib/i18n";
import { Segmented } from "../TopControls";
import { funnyName } from "@/lib/roomClient";
import { MAX_TEAMS, ROUND_TYPES, type RoundType, type Settings, type Team } from "@/lib/room";
import { btn, btn2, field, ghost, panel, press, round_btn, RoundIcon, TEAM, WhatsAppIcon, whatsappHref } from "@/lib/ui";
import { mini, Waiting, Cta, AiNameButton, type P } from "./common";

/** a name with a pencil; tap to edit inline */
function EditableName({ value, label, onSave, className = "" }: { value: string; label: string; onSave: (n: string) => void; className?: string }) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null)
    return (
      <button onClick={() => setDraft(value)} aria-label={`${label}: ${t.rename}`} className={`group flex min-w-0 items-center gap-1.5 text-left ${className}`}>
        <span className="min-w-0 break-words">{value}</span>
        <Pencil className="size-3.5 shrink-0 opacity-50 group-hover:opacity-100" aria-hidden />
      </button>
    );
  const save = () => {
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
    setDraft(null);
  };
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input autoFocus value={draft} maxLength={24} aria-label={label} onChange={(e) => setDraft(e.target.value)} onBlur={save} className="min-w-0 flex-1 rounded-lg bg-canvas px-2 py-1 font-semibold text-ink outline-none ring-2 ring-accent" />
      <button aria-label={t.save} className={mini}>
        <Check className="size-4" aria-hidden />
      </button>
    </form>
  );
}

function Stepper({ label, value, display, set, min, max }: { label: string; value: number; display?: ReactNode; set: (n: number) => void; min: number; max: number }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3 py-2 max-xs:flex-col max-xs:items-stretch max-xs:gap-1">
      <span className="font-medium">{label}</span>
      <div className="flex shrink-0 items-center gap-1 max-xs:self-end">
        <button onClick={() => set(value - 1)} disabled={value <= min} className={round_btn} aria-label={t.less(label)}>
          <Minus className="size-5" aria-hidden />
        </button>
        <span key={value} className="pop grid w-12 place-items-center text-xl font-bold tabular-nums">
          {display ?? value}
        </span>
        <button onClick={() => set(value + 1)} disabled={value >= max} className={round_btn} aria-label={t.more(label)}>
          <Plus className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

// a round in the host's list: drag it by the handle (long-press on touch; keyboard: focus the handle, Space, arrow keys, Space)
function RoundRow({ r, i, children }: { r: RoundType; i: number; children: ReactNode }) {
  const t = useT();
  const { ref, handleRef, isDragging } = useSortable({ id: r, index: i });
  return (
    <li ref={ref} data-round={r} className={`enter flex items-center gap-2 rounded-2xl bg-raised py-1.5 pr-1 ${isDragging ? "relative z-10 shadow-lg ring-2 ring-accent" : ""}`}>
      <button ref={handleRef} type="button" aria-label={t.moveRound(t.round[r].name)} className="flex min-w-0 flex-1 cursor-grab items-center gap-2 self-stretch rounded-xl pl-1.5 text-left select-none active:cursor-grabbing">
        <GripVertical className="size-4 shrink-0 text-muted max-xs:hidden" aria-hidden />
        <span className="w-3 shrink-0 text-sm font-bold text-muted tabular-nums">{i + 1}</span>
        <RoundIcon type={r} className="size-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate font-semibold">{t.round[r].name}</span>
      </button>
      {children}
    </li>
  );
}

export function Lobby({ v, send, busy, mode, share, onAdd }: P & { share?: { qr: string; copied: boolean; onShare: () => void; url: string }; onAdd?: (name: string) => Promise<void> }) {
  const t = useT();
  // only the host edits settings: show their taps at once, and send them one after another so quick taps never race
  const [pending, setPending] = useState<Partial<Settings>>({});
  const s = { ...v.settings, ...pending };
  const aiRoom = useAiRoom();
  const aiOn = useAiOn();
  const queue = useRef(Promise.resolve());
  const local = mode === "local";
  const set = (patch: Partial<Settings>) => {
    setPending((m) => ({ ...m, ...patch }));
    queue.current = queue.current.then(() => send({ type: "settings", settings: patch }));
  };
  const teams = v.teamNames.map((_, ti) => ti);
  const counts = teams.map((x) => v.players.filter((p) => p.team === x).length);
  const canStart = counts.every((c) => c >= 2);
  const mine = v.players[v.me]?.team ?? 0;
  const next = (team: Team) => ((team + 1) % teams.length) as Team; // two teams: the other one; more: the next in turn
  const skipStep = s.skips === -1 ? 6 : s.skips; // stepper runs 0…5, then ∞
  const off = ROUND_TYPES.filter((r) => !s.rounds.includes(r));
  const [adding, setAdding] = useState("");
  const addPlayer = async () => {
    if (!adding.trim() || !onAdd) return;
    await onAdd(adding.trim());
    setAdding("");
  };

  return (
    <div key="lobby" className="enter flex flex-1 flex-col gap-4">
      {aiRoom && aiOn && (
        <p className="flex items-center gap-2 rounded-2xl bg-raised px-4 py-2.5 text-sm font-medium">
          <Sparkles className="size-4 shrink-0 text-accent" aria-hidden /> {t.roomAi}
        </p>
      )}
      {share && (
        <section className={`${panel} flex items-center gap-4`}>
          {share.qr && (
            // eslint-disable-next-line @next/next/no-img-element -- local data: URL, nothing to optimise
            <img src={share.qr} alt={`QR ${v.code}`} width={132} height={132} className="pop size-33 shrink-0 rounded-xl" />
          )}
          <div className="flex min-w-0 flex-col items-start gap-1">
            <p className="text-sm text-muted">{t.scanOrCode}</p>
            <p translate="no" className="text-3xl font-extrabold tracking-[0.18em] text-hi">{v.code}</p>
            <div className="-ml-3 flex flex-col items-start">
              <button onClick={share.onShare} className={`${ghost} flex items-center gap-2 text-accent`}>
                {share.copied ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
                {share.copied ? t.copied : t.share}
              </button>
              <a href={whatsappHref(`${t.shareText(v.code)} ${share.url}`)} target="_blank" rel="noopener noreferrer" aria-label={t.whatsapp} className={`${ghost} flex items-center gap-2 font-semibold text-ink`}>
                <WhatsAppIcon className="size-5 text-whatsapp" /> WhatsApp
              </a>
            </div>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        {teams.map((ti) => (
          <div key={ti} className={`rounded-3xl px-4 py-3 ${TEAM[ti].soft}`}>
            <div className={`flex items-center justify-between gap-2 text-lg font-extrabold ${TEAM[ti].text}`}>
              {local || v.isHost || mine === ti ? (
                <span className="flex min-w-0 items-center gap-1">
                  <EditableName value={v.teamNames[ti]} label={t.teamName} onSave={(name) => send({ type: "teamName", team: ti, name })} />
                  <AiNameButton label={`${t.teamName}: ${t.aiName}`} disabled={busy} make={() => funnyName("team", s.lang, v.teamNames, t.funnyTeams, aiRoom)} onName={(name) => send({ type: "teamName", team: ti, name })} />
                </span>
              ) : (
                <span className="truncate">{v.teamNames[ti]}</span>
              )}
              <span key={counts[ti]} className="pop shrink-0 text-sm tabular-nums">
                {counts[ti]}
              </span>
            </div>
            <ul className="mt-2 flex flex-col gap-1">
              {v.players.map((p, i) =>
                p.team === ti ? (
                  <li key={i} className="pop flex min-h-9 items-center gap-1 font-medium">
                    {local || i === v.me ? (
                      <EditableName value={p.name} label={t.yourName} onSave={(name) => send({ type: "rename", name }, i)} className="flex-1" />
                    ) : (
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    )}
                    {!local && i === v.me && <span className="shrink-0 text-sm text-muted">({t.you})</span>}
                    {!local && i === v.hostIndex && <Crown className="size-4 shrink-0 text-hi" aria-label={t.host} />}
                    {local && (
                      <button onClick={() => send({ type: "team", team: next(p.team) }, i)} disabled={busy} aria-label={t.switchTo(v.teamNames[next(p.team)])} className={mini}>
                        <ArrowLeftRight className="size-4" aria-hidden />
                      </button>
                    )}
                    {v.isHost && i !== v.hostIndex && (
                      <button onClick={() => send({ type: "kick", player: i })} disabled={busy} aria-label={t.removePlayer(p.name)} className={mini}>
                        <X className="size-4" aria-hidden />
                      </button>
                    )}
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        ))}
      </section>

      {onAdd ? (
        <form
          className="-mt-1 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addPlayer();
          }}
        >
          <input value={adding} onChange={(e) => setAdding(e.target.value)} maxLength={24} placeholder={t.addPlayer} aria-label={t.addPlayer} className={`${field} min-w-0 flex-1 py-2.5 font-semibold`} />
          <AiNameButton
            label={t.aiName}
            make={() => funnyName("player", s.lang, v.players.map((p) => p.name), t.funnyPlayers, aiRoom, adding, t.namePrefixes)}
            onName={setAdding}
            className={`grid size-[3.2rem] shrink-0 place-items-center rounded-2xl border border-line bg-surface text-accent ${press}`}
          />
          <button disabled={busy || !adding.trim() || v.players.length >= 20} aria-label="+" className={`${btn2} w-auto! shrink-0 px-4`}>
            <UserPlus className="size-5" aria-hidden />
          </button>
        </form>
      ) : null}
      <div className="-mt-1 flex gap-2">
        {!local && (
          <button onClick={() => send({ type: "team", team: next(mine) })} disabled={busy} className={`${btn2} min-w-0`}>
            <ArrowLeftRight className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t.switchTo(v.teamNames[next(mine)])}</span>
          </button>
        )}
        {v.isHost && (
          <button onClick={() => send({ type: "shuffle" })} disabled={busy} className={`${btn2} ${local ? "" : "w-auto! shrink-0"}`}>
            <Shuffle className="size-4 shrink-0" aria-hidden /> {t.shuffle}
          </button>
        )}
      </div>

      <section className={panel}>
        <h2 className="text-lg font-bold">{t.settings}</h2>
        {v.isHost ? (
          <>
            <div className="mt-2 divide-y divide-line">
              <Stepper label={t.teamsCount} value={s.teams} set={(n) => set({ teams: n })} min={2} max={MAX_TEAMS} />
              <Stepper label={t.perPlayer} value={s.perPlayer} set={(n) => set({ perPlayer: n })} min={1} max={10} />
              <Stepper label={t.seconds} value={s.seconds} set={(n) => set({ seconds: s.seconds + (n - s.seconds) * 5 })} min={10} max={120} />
              <Stepper label={t.skips} value={skipStep} display={s.skips === -1 ? <Inf className="size-6" aria-label="∞" /> : undefined} set={(n) => set({ skips: n >= 6 ? -1 : n })} min={0} max={6} />
              {!local && (
                <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
                  <span>
                    <span className="block font-medium">{t.heckleOn}</span>
                    <span className="block text-sm text-muted">{t.heckleHelp}</span>
                  </span>
                  <input type="checkbox" role="switch" checked={s.heckle} onChange={(e) => set({ heckle: e.target.checked })} className="size-6 shrink-0 accent-accent" />
                </label>
              )}
              {!local && s.heckle && (
                <div className="py-2">
                  <Segmented
                    options={[{ id: "auto" as const, label: t.heckleAuto }, { id: "fixed" as const, label: t.heckleFixed }]}
                    value={s.heckleMode}
                    onChange={(heckleMode) => set({ heckleMode })}
                  />
                  <p className="mt-1.5 text-sm text-muted">{s.heckleMode === "auto" ? t.heckleAutoHelp : t.heckleFixedHelp}</p>
                </div>
              )}
              {!local && s.heckle && s.heckleMode === "fixed" && <Stepper label={t.heckles} value={s.heckles} set={(n) => set({ heckles: n })} min={1} max={5} />}
            </div>
            <h3 className="mt-4 font-semibold">{t.wordLang}</h3>
            <p className="text-sm text-muted">{t.wordLangHelp}</p>
            <div className="mt-2">
              <Segmented options={LANGS.map((l) => ({ id: l.id, label: l.label }))} value={s.lang} onChange={(lang) => set({ lang })} />
            </div>
            <h3 className="mt-4 font-semibold">{t.rounds}</h3>
            <p className="text-sm text-muted">{t.roundsHelp}</p>
            <DragDropProvider onDragEnd={(e) => { if (!e.canceled) set({ rounds: moved(s.rounds, e) }); }}>
            <ol className="mt-3 flex flex-col gap-2">
              {s.rounds.map((r, i) => (
                <RoundRow key={r} r={r} i={i}>
                  <button onClick={() => set({ rounds: s.rounds.filter((x) => x !== r) })} disabled={s.rounds.length === 1} aria-label={t.drop(t.round[r].name)} className={mini}>
                    <X className="size-4" aria-hidden />
                  </button>
                </RoundRow>
              ))}
              {off.map((r) => (
                <li key={r}>
                  <button onClick={() => set({ rounds: [...s.rounds, r] })} aria-label={t.addRound(t.round[r].name)} className={`flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-line py-2.5 pr-2 pl-3 text-left text-muted ${press}`}>
                    <Plus className="size-4 shrink-0" aria-hidden />
                    <RoundIcon type={r} className="size-5 shrink-0" />
                    <span className="flex-1 font-semibold">{t.round[r].name}</span>
                  </button>
                </li>
              ))}
            </ol>
            </DragDropProvider>
          </>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-muted">
            <li>{t.sumTeams(s.teams)}</li>
            <li>{t.sumPerPlayer(s.perPlayer)}</li>
            <li>{t.sumSeconds(s.seconds)}</li>
            <li>{t.sumSkips(s.skips)}</li>
            {s.heckle && <li>{s.heckleMode === "auto" ? t.sumHeckleAuto : t.sumHeckle(s.heckles)}</li>}
            <li>{t.sumLang(LANGS.find((l) => l.id === s.lang)!.label)}</li>
            <li className="mt-2 flex flex-wrap gap-2">
              {s.rounds.map((r, i) => (
                <span key={r} className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1 text-sm text-ink">
                  <RoundIcon type={r} className="size-4 text-accent" />
                  {i + 1}. {t.round[r].name}
                </span>
              ))}
            </li>
          </ul>
        )}
      </section>

      <Cta>
        {v.isHost ? (
          <button onClick={() => send({ type: "start" })} disabled={busy || !canStart} className={btn}>
            {canStart ? t.start : t.needTwo}
          </button>
        ) : (
          <Waiting text={t.hostStarts(v.players[v.hostIndex]?.name ?? "")} />
        )}
      </Cta>
    </div>
  );
}
