// Heckling ("Stören"): during a turn the other teams may disturb the describer's Zetteli for a moment.
// Fixed mode: every player has a few presses per turn. Auto mode (default): when a turn starts, teams that are behind
// may get a bonus press or two, shared by the team. One heckle at a time, at most a third of a turn disturbed.
import { cleanSettings, type Settings } from "./settings.ts";
import type { Phase, Team } from "./room.ts";

/** what a room keeps about heckling; all optional, rooms from before heckling have none of it */
export type Heckles = {
  heckled?: Record<number, number>; // presses per player index in the running turn, cleared when a turn starts (fixed mode)
  heckleBonus?: number[]; // presses left per team in the running turn (auto mode), drawn when the turn starts
  heckleGranted?: number[]; // what each team was granted at the start of the running turn (auto mode)
  heckleLog?: { by: number; bonus: boolean }[]; // every press this game, for the end stats
  bonusGot?: number[]; // per team: bonus presses granted this game (auto mode)
  heckledMs?: number; // disturbed time in the running turn
  lastHeckle?: { n: number; by: number; until: number } | null; // disturbs the describer's Zetteli until `until`; n changes with each press
};

/** the part of a room heckling reads: whose turn, its clock, the scores so far */
type Turn = Heckles & {
  settings: Settings;
  phase: Phase;
  teams: Team[]; // per player index
  team: Team; // describing now
  teamNames: string[];
  scores: number[][]; // per round, per team
  turnStart: number;
  endsAt: number;
  pausedAt: number;
};

const MAX_LOG = 500;

/** one heckle disturbs the describer for a tenth of the turn, 2–5 s */
export const heckleMs = (turnMs: number) => Math.min(5000, Math.max(2000, Math.round(turnMs / 10)));
/** at most a third of a turn may be disturbed */
const heckleBudget = (turnMs: number) => Math.round(turnMs / 3);
const isAuto = (room: Turn) => cleanSettings(room.settings).heckleMode === "auto";

/**
 * auto heckling: when a turn starts, each team that is behind the leader (and isn't describing) may get a bonus to
 * disturb: 30 % chance plus 10 % per point behind, at most 80 %; 1 press for the team, 2 when 5 or more behind.
 * The leader and teams level with it get nothing. Returns presses per team.
 */
export function heckleBonus(totals: number[], active: number, rand: () => number = Math.random) {
  const best = Math.max(...totals);
  return totals.map((score, t) => {
    const behind = best - score;
    if (t === active || behind <= 0) return 0;
    return rand() < Math.min(0.8, 0.3 + 0.1 * behind) ? (behind >= 5 ? 2 : 1) : 0;
  });
}

/** a turn starts (its team and scores already set): fresh presses, and in auto mode the dice decide the bonus */
export function startHeckles(room: Turn, rand: () => number) {
  const totals = room.teamNames.map((_, t) => room.scores.reduce((sum, r) => sum + (r[t] ?? 0), 0));
  const bonus = room.settings.heckle && isAuto(room) ? heckleBonus(totals, room.team, rand) : [];
  Object.assign(room, { heckled: {}, heckledMs: 0, heckleBonus: bonus, heckleGranted: bonus } satisfies Heckles);
  if (bonus.some(Boolean)) room.bonusGot = room.teamNames.map((_, t) => (room.bonusGot?.[t] ?? 0) + (bonus[t] ?? 0));
}

/**
 * player `by` presses the heckle button. "ok": the describer is disturbed now. "ignored": nothing happens (no running
 * turn, paused, time up, one is still running, or this turn is disturbed enough). "forbidden": heckling is off or `by`
 * is on the describing team. "used": no presses left.
 */
export function heckle(room: Turn, by: number, now: number): "ok" | "ignored" | "forbidden" | "used" {
  if (room.phase !== "turn" || room.pausedAt || now > room.endsAt) return "ignored";
  if (!(room.settings.heckle && by >= 0 && room.teams[by] !== room.team)) return "forbidden";
  const auto = isAuto(room);
  const used = room.heckled?.[by] ?? 0;
  const mine = room.teams[by];
  if (auto ? !(room.heckleBonus?.[mine] ?? 0) : used >= cleanSettings(room.settings).heckles) return "used";
  const turnMs = room.endsAt - room.turnStart;
  const budget = heckleBudget(turnMs) - (room.heckledMs ?? 0);
  if (now < (room.lastHeckle?.until ?? 0) || budget <= 0) return "ignored"; // someone was faster
  const ms = Math.min(heckleMs(turnMs), budget);
  if (auto) room.heckleBonus = room.heckleBonus!.map((x, t) => (t === mine ? x - 1 : x)); // the team's bonus, whoever presses
  else room.heckled = { ...room.heckled, [by]: used + 1 };
  room.heckledMs = (room.heckledMs ?? 0) + ms;
  room.lastHeckle = { n: (room.lastHeckle?.n ?? 0) + 1, by, until: now + ms };
  if ((room.heckleLog ??= []).length < MAX_LOG) room.heckleLog.push({ by, bonus: auto });
  return "ok";
}

/** what player `me` (-1: not playing) sees of heckling */
export function heckleView(room: Turn, me: number) {
  const turn = room.phase === "turn";
  return {
    lastHeckle: room.lastHeckle ?? null, // the describer's Zetteli is disturbed until `until` (server clock), nobody heckles meanwhile
    heckles: // presses I have left this turn (auto mode: my team's bonus)
      turn && room.settings.heckle && me >= 0 && room.teams[me] !== room.team
        ? isAuto(room)
          ? (room.heckleBonus?.[room.teams[me]] ?? 0)
          : Math.max(0, cleanSettings(room.settings).heckles - (room.heckled?.[me] ?? 0))
        : 0,
    heckleDone: turn && (room.heckledMs ?? 0) >= heckleBudget(room.endsAt - room.turnStart), // this turn has been disturbed enough
    heckleGranted: turn && me >= 0 ? (room.heckleGranted?.[room.teams[me]] ?? 0) : 0, // auto mode: my team's bonus this turn (0: no button)
  };
}
