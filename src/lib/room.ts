import { funnyTeams, type Lang } from "./i18n.ts";
import type { Store } from "./store.ts";

const TTL = 60 * 60 * 24; // rooms vanish a day after the last write
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I lookalikes
export const CODE_LEN = 5; // 32^5 ≈ 33 million codes: hard to guess a live room; older 4-letter rooms keep working
const GRACE = 1500; // a "got" tapped at 0:00 still counts while it travels to the server
const MAX_SHEET = 3000; // strokes per drawing sheet; a wipe or the next Zetteli starts a new one
const MAX_LOG = 5000; // events kept for the stats; a real game has a few hundred, so only skip-spamming hits this
const MIN_CARRY = 5000; // less time left than this when the bowl empties → next player starts the new round
export const MAX_PLAYERS = 20;
/** one heckle disturbs the describer for a tenth of the turn, 2–5 s */
export const heckleMs = (turnMs: number) => Math.min(5000, Math.max(2000, Math.round(turnMs / 10)));
/** at most a third of a turn may be disturbed */
const heckleBudget = (turnMs: number) => Math.round(turnMs / 3);

export const ROUND_TYPES = ["describe", "pantomime", "oneword", "sound", "draw"] as const;
export type RoundType = (typeof ROUND_TYPES)[number];
export const DEFAULT_ROUNDS: RoundType[] = ["describe", "pantomime", "oneword", "sound"]; // drawing is opt-in, and needs every phone
/** one written Zetteli; the hint is shown small to the describer (AI-suggested, the writer may change it) */
export type Slip = { word: string; hint: string };
/** a player's writing so far; words someone else also wrote are cancelled on both sides */
type WriteEntry = { words: Slip[]; cancelled: string[] };
/** compare words the way players would: case, accents, ß and punctuation don't matter */
export const norm = (w: string) =>
  w.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/ß/g, "ss").replace(/[^\p{L}\p{N}]/gu, "");
/** a drawn line: [color index, x0, y0, x1, y1, …] on a 0…1000 grid */
export type Stroke = number[];
export type Team = number; // 0 … settings.teams - 1
export const MAX_TEAMS = 4; // the app is built for any number; colours exist for four
export type Settings = { perPlayer: number; seconds: number; rounds: RoundType[]; skips: number; lang: Lang; teams: number; heckle: boolean; heckles: number }; // skips: per turn, -1 = unlimited; lang: of the Zetteli (AI check, hints, ideas), each phone keeps its own UI language; heckle: the other teams may disturb the describer, `heckles` times each per turn
export type Phase = "lobby" | "write" | "ready" | "turn" | "roundEnd" | "end";
/** one moment a Zetteli was in someone's hand: guessed, skipped, or still there when time ran out */
export type Ev = { w: number; r: number; p: number; ms: number; res: "got" | "skip" | "time" };
export type TurnLog = { r: number; p: number; got: number; ms: number };
/** a Zetteli drawn in a drawing round, kept for the replay at the end: its last sheet (after wipes), how long it was in hand */
export type Drawing = { w: number; r: number; p: number; sheet: number; ms: number; got: boolean };
const MAX_DRAWINGS = 300; // empty sheets aren't kept, so only a lot of real drawing gets near this

type Member = { id: string; name: string; token: string; at: number; team: Team };
type Room = {
  code: string;
  hostId: string;
  settings: Settings;
  teamNames: string[];
  phase: Phase;
  ids: string[]; // player order, frozen when writing starts; indices below refer to it
  teams: Team[];
  words: string[];
  hints: string[];
  authors: number[];
  bowl: number[]; // word ids still in the bowl, including the one in hand
  current: number | null;
  held: number[]; // skipped this turn and set aside, the describer can swap back to them
  shownAt: number;
  round: number;
  team: Team; // whose turn it is
  next: number[]; // per team: how many turns it had, picks its next describer
  turnStart: number;
  endsAt: number;
  pausedAt: number; // 0 = running; a paused turn neither ticks nor times out
  drawNo: number; // a fresh sheet for every Zetteli drawn and every wipe
  carryMs: number;
  turnGot: number;
  lastGot: { n: number; text: string; by: number } | null; // flashed on every phone; n changes with each guess
  heckled?: Record<number, number>; // presses per player index in the running turn, cleared when a turn starts
  heckledMs?: number; // disturbed time in the running turn
  lastHeckle?: { n: number; by: number; until: number } | null; // disturbs the describer's Zetteli until `until`; n changes with each press
  scores: number[][]; // per round, per team
  log: Ev[];
  turns: TurnLog[];
  drawings?: Drawing[]; // missing in rooms from before the replay
  writeNo: number;
  turnNo: number;
  aiBy?: string; // user id of a host who was signed in when creating the room: AI is on for everyone in it, on that host's budget
};

export class RoomError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "started" | "full" | "bad_request" | "teams",
    public status = code === "not_found" ? 404 : code === "forbidden" ? 403 : code === "bad_request" ? 400 : 409,
  ) {
    super(code);
  }
}

const k = (code: string) => ({ room: `room:${code}`, members: `room:${code}:members` });
const cleanName = (n: unknown) => (typeof n === "string" ? n.trim().slice(0, 24) : "");
const clamp = (n: unknown, lo: number, hi: number, def: number) => Math.max(lo, Math.min(hi, Math.round(Number(n)) || def));
const pick = (n: number) => Math.floor(Math.random() * n);
// randomUUID only exists on https/localhost; one-phone games also run over plain http on the LAN
const uid = () =>
  crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

export function cleanSettings(s: Partial<Settings>): Settings {
  const rounds = Array.isArray(s.rounds) ? [...new Set(s.rounds.filter((r) => ROUND_TYPES.includes(r)))] : [];
  return {
    perPlayer: clamp(s.perPlayer, 1, 10, 4),
    seconds: Math.round(clamp(s.seconds, 10, 120, 30) / 5) * 5,
    rounds: rounds.length ? rounds : [...DEFAULT_ROUNDS],
    skips: s.skips === -1 ? -1 : clamp(s.skips ?? 1, 0, 5, 0),
    lang: s.lang === "en" || s.lang === "fr" ? s.lang : "de",
    teams: clamp(s.teams, 2, MAX_TEAMS, 2),
    heckle: s.heckle === true,
    heckles: clamp(s.heckles, 1, 5, 2),
  };
}

async function load(db: Store, code: string) {
  const room = await db.get<Room>(k(code).room);
  if (!room) throw new RoomError("not_found");
  const members = Object.values(await db.hgetall<Member>(k(code).members)).sort((a, b) => a.at - b.at);
  return { room, members };
}

const save = (db: Store, room: Room) => db.set(k(room.code).room, room, { ex: TTL });

/** the team with the fewest players (the first of them on a tie) */
const smallest = (members: Member[], teams: number) => {
  const sizes = Array.from({ length: teams }, (_, t) => members.filter((m) => m.team === t).length);
  return sizes.indexOf(Math.min(...sizes));
};

async function addMember(db: Store, code: string, name: string, members: Member[], teamCount: number) {
  const team = smallest(members, teamCount);
  const m: Member = { id: uid(), name, token: uid(), at: Date.now(), team };
  await db.hset(k(code).members, m.id, m, TTL);
  return m;
}

export async function createRoom(db: Store, hostName: unknown, lang: unknown = "de", aiBy = "") {
  const name = cleanName(hostName);
  if (!name) throw new RoomError("bad_request");
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from({ length: CODE_LEN }, () => CODE_CHARS[pick(CODE_CHARS.length)]).join("");
    const room: Room = {
      code, hostId: "", settings: cleanSettings({ lang: lang as Lang }), teamNames: funnyTeams(lang === "en" || lang === "fr" ? (lang as Lang) : "de", 2), phase: "lobby", ids: [], teams: [], words: [], hints: [], authors: [],
      bowl: [], current: null, held: [], shownAt: 0, round: 0, team: 0, next: [0, 0], turnStart: 0, endsAt: 0, pausedAt: 0, drawNo: 0, carryMs: 0,
      turnGot: 0, lastGot: null, scores: [], log: [], turns: [], drawings: [], writeNo: 0, turnNo: 0, aiBy,
    };
    if (!(await db.set(k(code).room, room, { ex: TTL, nx: true }))) continue; // code taken, roll again
    const host = await addMember(db, code, name, [], room.teamNames.length);
    room.hostId = host.id;
    await save(db, room);
    return { code, pid: host.id, token: host.token };
  }
  throw new Error("no free room code");
}

export async function joinRoom(db: Store, code: string, name: unknown) {
  const n = cleanName(name);
  if (!n) throw new RoomError("bad_request");
  const { room, members } = await load(db, code);
  if (room.phase !== "lobby") throw new RoomError("started");
  if (members.length >= MAX_PLAYERS) throw new RoomError("full");
  const m = await addMember(db, code, n, members, room.teamNames.length);
  return { code, pid: m.id, token: m.token };
}

// drawing: one sheet (a Redis list of strokes) per Zetteli in hand; a new Zetteli or a wipe starts the next sheet.
// The drawer's phone writes to it directly, checked against `drawer`, so no room load per batch.
const sheetKey = (code: string, n: number) => `room:${code}:sheet:${n}`;
const drawerKey = (code: string) => `room:${code}:drawer`;
type Drawer = { pid: string; token: string; sheet: number; until: number };
const drawing = (room: Room) => room.phase === "turn" && room.settings.rounds[room.round] === "draw";

/** who may draw on which sheet until when; written whenever a drawing game's room changes */
async function syncDrawer(db: Store, room: Room, members: Member[]) {
  const d = drawing(room) && !room.pausedAt && room.current !== null ? members.find((m) => m.id === room.ids[describer(room)]) : undefined;
  const v: Drawer = d ? { pid: d.id, token: d.token, sheet: room.drawNo, until: room.endsAt + GRACE } : { pid: "", token: "", sheet: room.drawNo, until: 0 };
  await db.set(drawerKey(room.code), v, { ex: 60 * 60 });
}

const validStrokes = (ss: unknown): ss is Stroke[] =>
  Array.isArray(ss) && ss.length > 0 && ss.length <= 20 && ss.every((st) => Array.isArray(st) && st.length >= 3 && st.length <= 401 && st.every((n) => Number.isInteger(n) && n >= 0 && n <= 1000));

/** drawer's phone: add lines to the current sheet */
export async function pushStrokes(db: Store, code: string, pid: unknown, token: unknown, sheet: unknown, strokes: unknown, now = Date.now()) {
  if (!validStrokes(strokes)) throw new RoomError("bad_request");
  const d = await db.get<Drawer>(drawerKey(code));
  if (!d || !d.pid || d.pid !== pid || d.token !== token || d.sheet !== sheet || now > d.until) throw new RoomError("forbidden");
  if ((await db.rpush(sheetKey(code, d.sheet), strokes, 60 * 60, MAX_SHEET)) > MAX_SHEET) throw new RoomError("bad_request");
}

/** a finished drawing for the replay: exactly this sheet, all of it */
export async function sheetStrokes(db: Store, code: string, sheet: number) {
  const r = await db.lrangeWith<Stroke, Drawer>(sheetKey(code, sheet), 0, drawerKey(code));
  return { sheet, from: 0, strokes: r.items };
}

/**
 * drawings recorded since `from`: their sheets now live as long as the room (sheets expire after an hour otherwise).
 * A sheet that doesn't exist was never drawn on (skipped at once, wiped and left blank): nothing to replay, so it's dropped.
 */
async function keepDrawings(db: Store, room: Room, from: number) {
  const ds = room.drawings ?? [];
  if (ds.length <= from) return;
  const kept = await Promise.all(ds.slice(from).map((d) => db.expire(sheetKey(room.code, d.sheet), TTL)));
  room.drawings = [...ds.slice(0, from), ...ds.slice(from).filter((_, i) => kept[i])];
}

/** every other phone: the lines of the current sheet from `from` on; a new sheet (wipe, next Zetteli) starts over at 0 */
export async function pullStrokes(db: Store, code: string, sheet: number, from: number) {
  const r = await db.lrangeWith<Stroke, Drawer>(sheetKey(code, sheet), Math.max(0, from), drawerKey(code));
  const current = r.other?.sheet ?? sheet;
  if (current === sheet) return { sheet, from, strokes: r.items };
  const fresh = await db.lrangeWith<Stroke, Drawer>(sheetKey(code, current), 0, drawerKey(code));
  return { sheet: current, from: 0, strokes: fresh.items };
}

const teamPlayers = (room: Room, t: Team) => room.teams.flatMap((x, i) => (x === t ? [i] : []));
/** who describes next (ready) or now (turn) */
export const describer = (room: Room) => {
  const ps = teamPlayers(room, room.team);
  return ps[room.next[room.team] % ps.length];
};

// bowl minus what's in hand or set aside
const fresh = (room: Room) => room.bowl.filter((w) => w !== room.current && !room.held.includes(w));

/** next Zetteli from the bowl; when only set-aside ones are left, take those back */
function draw(room: Room, now: number) {
  const pool = fresh(room);
  room.current = pool.length ? pool[pick(pool.length)] : (room.held.shift() ?? null);
  room.shownAt = now;
  room.drawNo++;
}

/** the Zetteli in hand was guessed: score it, then draw the next one or close the round */
function guessed(room: Room, now: number, by: number) {
  const w = room.current!;
  logHand(room, now, "got");
  room.lastGot = { n: room.turnNo * 1000 + room.turnGot + 1, text: room.words[w], by };
  room.scores[room.round][room.team]++;
  room.turnGot++;
  room.bowl = room.bowl.filter((x) => x !== w);
  room.current = null;
  if (room.bowl.length) return draw(room, now);
  // bowl empty: round over; with enough time left the same describer opens the next round
  const left = room.endsAt - now;
  room.carryMs = left >= MIN_CARRY ? left : 0;
  closeTurn(room, now, room.carryMs > 0);
  room.phase = room.round + 1 < room.settings.rounds.length ? "roundEnd" : "end";
}

function logHand(room: Room, at: number, res: Ev["res"]) {
  if (room.current === null) return;
  const e = { w: room.current, r: room.round, p: describer(room), ms: Math.max(0, at - room.shownAt) };
  if (drawing(room) && (room.drawings ??= []).length < MAX_DRAWINGS) room.drawings.push({ ...e, sheet: room.drawNo, got: res === "got" });
  if (res !== "got" && room.log.length >= MAX_LOG) return; // guesses always count; they're bounded by the words
  room.log.push({ ...e, res });
}

function closeTurn(room: Room, at: number, keepDescriber: boolean) {
  room.turns.push({ r: room.round, p: describer(room), got: room.turnGot, ms: Math.max(0, at - room.turnStart) });
  room.current = null;
  room.held = [];
  if (keepDescriber) return;
  room.next[room.team]++;
  room.team = (room.team + 1) % room.teamNames.length;
}

/** time ran out: the Zetteli in hand goes back into the bowl, the other team is up */
function settle(room: Room, now: number) {
  if (room.phase !== "turn" || room.pausedAt || now <= room.endsAt + GRACE) return false;
  logHand(room, room.endsAt, "time");
  closeTurn(room, room.endsAt, false);
  room.phase = "ready";
  return true;
}

export type Action =
  | { type: "start" | "go" | "nextRound" | "pass" | "lobby" | "shuffle" | "pause" | "resume" | "cancel" | "heckle" }
  | { type: "settings"; settings: Partial<Settings> }
  | { type: "team"; team: Team }
  | { type: "rename"; name: string }
  | { type: "kick"; player: number }
  | { type: "teamName"; team: Team; name: string }
  | { type: "words"; words: (string | Partial<Slip>)[] }
  | { type: "got" | "skip"; w: number }
  | { type: "teamGot"; seen: number } // a teammate taps "Erraten"; `seen` = turnGot on their screen, so a word counts once
  | { type: "back"; w: number; to: number }
  | { type: "wipe" };

/** the user id whose AI budget a room member may use, or "" when the room has no AI or this isn't a member */
export async function roomAi(db: Store, code: unknown, pid: unknown, token: unknown) {
  if (typeof code !== "string" || !/^[A-Z0-9]{4,6}$/.test(code)) return "";
  const [room, members] = await Promise.all([db.get<Room>(k(code).room), db.hgetall<Member>(k(code).members)]);
  const me = members[String(pid)];
  return room?.aiBy && me && me.token === token ? room.aiBy : "";
}

/** the host signed in after opening the room: from now on AI is on for everyone in it, on their budget */
export async function claimAi(db: Store, code: string, pid: unknown, token: unknown, userId: string) {
  const { room, members } = await load(db, code);
  const me = members.find((m) => m.id === pid);
  if (!me || me.token !== token || me.id !== room.hostId || !userId) throw new RoomError("forbidden");
  if (room.aiBy) return;
  room.aiBy = userId;
  await save(db, room);
}

export async function act(db: Store, code: string, pid: unknown, token: unknown, a: Action, now = Date.now()) {
  const { room, members } = await load(db, code);
  const me = members.find((m) => m.id === pid);
  if (!me || me.token !== token) throw new RoomError("forbidden");
  const host = me.id === room.hostId;
  const idx = room.ids.indexOf(me.id);
  const need = (ok: boolean) => {
    if (!ok) throw new RoomError("forbidden");
  };
  const drawn = room.drawings?.length ?? 0;
  settle(room, now);
  const wasTurn = room.phase === "turn";

  switch (a.type) {
    case "settings": {
      need(host && room.phase === "lobby");
      room.settings = cleanSettings({ ...room.settings, ...a.settings });
      const n = room.settings.teams;
      if (n !== room.teamNames.length) {
        // more teams: new funny names; fewer: players of a dropped team go to the smallest remaining one
        room.teamNames = n > room.teamNames.length ? [...room.teamNames, ...funnyTeams(room.settings.lang, n - room.teamNames.length, room.teamNames)] : room.teamNames.slice(0, n);
        const kept = members.filter((m) => m.team < n);
        for (const m of members.filter((m) => m.team >= n)) {
          const moved = { ...m, team: smallest(kept, n) };
          kept.push(moved);
          await db.hset(k(code).members, m.id, moved, TTL);
        }
      }
      break;
    }
    case "team":
      need(room.phase === "lobby" && Number.isInteger(a.team) && a.team >= 0 && a.team < room.teamNames.length);
      await db.hset(k(code).members, me.id, { ...me, team: a.team }, TTL);
      return;
    case "rename": {
      const name = cleanName(a.name);
      need(room.phase === "lobby" && !!name);
      await db.hset(k(code).members, me.id, { ...me, name }, TTL);
      return;
    }
    case "kick": {
      const m = Number.isInteger(a.player) ? members[a.player] : undefined;
      need(host && room.phase === "lobby" && !!m && m.id !== room.hostId);
      await db.hdel(k(code).members, m!.id);
      return;
    }
    case "teamName": {
      const name = cleanName(a.name);
      need(room.phase === "lobby" && Number.isInteger(a.team) && a.team >= 0 && a.team < room.teamNames.length && !!name && (host || me.team === a.team));
      room.teamNames[a.team] = name;
      break;
    }
    case "shuffle": {
      need(host && room.phase === "lobby");
      const order = members.map((m) => [Math.random(), m] as const).sort((x, y) => x[0] - y[0]);
      const n = room.teamNames.length;
      const shift = pick(n); // uneven count: any team may get the extra players
      await Promise.all(order.map(([, m], i) => db.hset(k(code).members, m.id, { ...m, team: (i + shift) % n }, TTL)));
      return;
    }
    case "start": {
      need(host && room.phase === "lobby");
      const n = room.teamNames.length;
      if (room.teamNames.some((_, t) => members.filter((m) => m.team === t).length < 2)) throw new RoomError("teams");
      Object.assign(room, {
        ids: members.map((m) => m.id), teams: members.map((m) => m.team), words: [], authors: [], bowl: [],
        current: null, held: [], pausedAt: 0, round: 0, team: pick(n), next: Array(n).fill(0), carryMs: 0, scores: [], log: [], turns: [], drawings: [],
        phase: "write", writeNo: room.writeNo + 1,
      } satisfies Partial<Room>);
      break;
    }
    case "words": {
      need(room.phase === "write" && idx >= 0);
      const slips: Slip[] = (Array.isArray(a.words) ? a.words : []).map((w) => {
        const o = typeof w === "string" ? { word: w } : (w ?? {});
        return { word: String(o.word ?? "").trim().slice(0, 40), hint: String(o.hint ?? "").trim().slice(0, 80) };
      });
      const n = room.settings.perPlayer;
      if (slips.length !== n || slips.some((x) => !norm(x.word)) || new Set(slips.map((x) => norm(x.word))).size !== n) throw new RoomError("bad_request");
      const key = `room:${code}:words:${room.writeNo}`;
      const all = await db.hgetall<WriteEntry>(key);
      const mine: WriteEntry = { words: slips, cancelled: [] };
      // same word as someone else: both copies go, both writers write a new one
      // ponytail: two phones submitting the same word in the same instant can both slip through
      for (const [j, other] of Object.entries(all)) {
        if (Number(j) === idx) continue;
        const clash = new Set(other.words.map((o) => norm(o.word)).filter((w) => mine.words.some((x) => norm(x.word) === w)));
        if (!clash.size) continue;
        await db.hset(key, j, { words: other.words.filter((o) => !clash.has(norm(o.word))), cancelled: [...other.cancelled, ...other.words.filter((o) => clash.has(norm(o.word))).map((o) => o.word)] }, TTL);
        mine.cancelled.push(...mine.words.filter((x) => clash.has(norm(x.word))).map((x) => x.word));
        mine.words = mine.words.filter((x) => !clash.has(norm(x.word)));
      }
      await db.hset(key, String(idx), mine, TTL);
      const now2 = await db.hgetall<WriteEntry>(key);
      if (!room.ids.every((_, i) => now2[String(i)]?.words.length === n)) return; // others still writing; room itself unchanged
      // ponytail: two last writers racing both build the same bowl from the same hash, so the double write is harmless
      const entries = room.ids.map((_, i) => now2[String(i)].words);
      room.words = entries.flatMap((ws) => ws.map((x) => x.word));
      room.hints = entries.flatMap((ws) => ws.map((x) => x.hint));
      room.authors = entries.flatMap((ws, i) => ws.map(() => i));
      room.bowl = room.words.map((_, i) => i);
      room.scores = room.settings.rounds.map(() => room.teamNames.map(() => 0));
      room.phase = "ready";
      break;
    }
    case "go": {
      need(room.phase === "ready" && idx === describer(room));
      const ms = room.carryMs || room.settings.seconds * 1000;
      Object.assign(room, { carryMs: 0, turnStart: now, endsAt: now + ms, turnGot: 0, phase: "turn", turnNo: room.turnNo + 1, heckled: {}, heckledMs: 0 });
      draw(room, now);
      break;
    }
    case "pause":
      if (room.phase !== "turn" || room.pausedAt || now > room.endsAt) return;
      need(host || idx === describer(room));
      room.pausedAt = now;
      break;
    case "resume": {
      if (room.phase !== "turn" || !room.pausedAt) return;
      need(host || idx === describer(room));
      // the pause didn't happen: shift every clock of this turn by its length
      const d = now - room.pausedAt;
      room.endsAt += d;
      room.shownAt += d;
      room.turnStart += d;
      if (room.lastHeckle && room.lastHeckle.until > room.pausedAt) room.lastHeckle.until += d; // a running heckle resumes too
      room.pausedAt = 0;
      break;
    }
    case "wipe":
      if (!drawing(room)) return;
      need(idx === describer(room));
      room.drawNo++;
      break;
    case "cancel": // stop the game, keep players, teams and settings
      need(host && room.phase !== "lobby");
      Object.assign(room, { phase: "lobby", current: null, held: [], pausedAt: 0, carryMs: 0 } satisfies Partial<Room>);
      break;
    case "teamGot":
      if (room.phase !== "turn" || room.pausedAt || room.current === null || a.seen !== room.turnGot || now > room.endsAt + GRACE) return; // someone was faster
      need(idx >= 0 && room.teams[idx] === room.team);
      guessed(room, now, idx);
      break;
    case "heckle": {
      // someone from another team disturbs the describer: one at a time, a few presses each, at most a third of the turn
      if (room.phase !== "turn" || room.pausedAt || now > room.endsAt) return;
      need(room.settings.heckle && idx >= 0 && room.teams[idx] !== room.team);
      const used = room.heckled?.[idx] ?? 0;
      if (used >= cleanSettings(room.settings).heckles) throw new RoomError("bad_request");
      const turnMs = room.endsAt - room.turnStart;
      const budget = heckleBudget(turnMs) - (room.heckledMs ?? 0);
      if (now < (room.lastHeckle?.until ?? 0) || budget <= 0) return; // one is running, or enough for this turn: someone was faster
      const ms = Math.min(heckleMs(turnMs), budget);
      room.heckled = { ...room.heckled, [idx]: used + 1 };
      room.heckledMs = (room.heckledMs ?? 0) + ms;
      room.lastHeckle = { n: (room.lastHeckle?.n ?? 0) + 1, by: idx, until: now + ms };
      break;
    }
    case "got": {
      if (room.phase !== "turn" || room.pausedAt || a.w !== room.current) return; // double tap on a Zetteli already counted
      need(idx === describer(room));
      guessed(room, now, idx);
      break;
    }
    case "skip": {
      if (room.phase !== "turn" || room.pausedAt || a.w !== room.current || now > room.endsAt || !fresh(room).length) return;
      need(idx === describer(room));
      const unlimited = room.settings.skips === -1;
      if (!unlimited && room.held.length >= room.settings.skips) throw new RoomError("bad_request");
      logHand(room, now, "skip");
      if (!unlimited) room.held.push(a.w);
      draw(room, now);
      break;
    }
    case "back": {
      // swap the one in hand with a set-aside one; doesn't use up a skip
      if (room.phase !== "turn" || room.pausedAt || a.w !== room.current || now > room.endsAt || !room.held.includes(a.to)) return;
      need(idx === describer(room));
      logHand(room, now, "skip");
      room.held = room.held.map((w) => (w === a.to ? a.w : w));
      room.current = a.to;
      room.shownAt = now;
      room.drawNo++;
      break;
    }
    case "nextRound":
      need(host && room.phase === "roundEnd");
      room.round++;
      room.bowl = room.words.map((_, i) => i);
      room.phase = "ready";
      break;
    case "pass": // the describer isn't there: skip them
      need(host && room.phase === "ready");
      room.carryMs = 0;
      room.next[room.team]++;
      room.team = (room.team + 1) % room.teamNames.length;
      break;
    case "lobby":
      need(host && room.phase === "end");
      room.phase = "lobby";
      break;
    default:
      throw new RoomError("bad_request");
  }
  await keepDrawings(db, room, drawn);
  await save(db, room);
  // the drawer record only matters around drawing turns
  if (room.settings.rounds.includes("draw") && (wasTurn || room.phase === "turn")) await syncDrawer(db, room, members);
}

export type View = {
  code: string;
  ai: boolean; // a signed-in host opened this room: everyone in it may use AI
  phase: Phase;
  settings: Settings;
  teamNames: string[];
  players: { name: string; team: Team }[];
  me: number; // index in players, -1 when not joined
  isHost: boolean;
  hostIndex: number;
  now: number; // server clock, so phones can correct their own
  round: number;
  team: Team;
  active: number | null; // describer in ready/turn
  endsAt: number;
  pausedLeft: number; // ms left when paused, 0 while running
  carryMs: number;
  word: { id: number; text: string; hint: string } | null; // only on the describer's phone
  myWrite: WriteEntry | null; // write phase: what I have in the bowl so far, and which of mine were cancelled
  held: { id: number; text: string }[]; // set-aside Zetteli, describer only
  sheet: number | null; // drawing rounds: the current sheet, read live via pullStrokes
  canSkip: boolean;
  bowlLeft: number;
  total: number;
  turnGot: number; // guessed so far in the running turn
  lastGot: { n: number; text: string; by: number } | null; // the latest guessed Zetteli, flashed on the other phones
  lastHeckle: { n: number; by: number; until: number } | null; // the latest heckle; the describer's Zetteli is disturbed until `until` (server clock), nobody heckles meanwhile
  heckles: number; // heckles I have left this turn
  heckleDone: boolean; // this turn has been disturbed enough
  scores: number[][];
  lastTurn: TurnLog | null;
  done: number; // players who wrote their words
  iDone: boolean;
  turnNo: number;
  stats: null | { words: string[]; authors: number[]; log: Ev[]; turns: TurnLog[]; drawings: Drawing[] };
};

/** What one player may see: Zetteli only while describing them, everything at the end. */
export async function view(db: Store, code: string, pid: unknown, token: unknown, now = Date.now()): Promise<View> {
  const { room, members } = await load(db, code);
  const drawn = room.drawings?.length ?? 0;
  if (settle(room, now)) {
    await keepDrawings(db, room, drawn);
    await save(db, room);
  }
  const me = members.find((m) => m.id === pid && m.token === token);
  const lobby = room.phase === "lobby";
  const players = lobby
    ? members.map((m) => ({ name: m.name, team: m.team }))
    : room.ids.map((id, i) => ({ name: members.find((m) => m.id === id)?.name ?? "?", team: room.teams[i] }));
  const order = lobby ? members.map((m) => m.id) : room.ids;
  const idx = me ? order.indexOf(me.id) : -1;
  const playing = room.phase === "ready" || room.phase === "turn";
  const active = playing ? describer(room) : null;

  let done = 0;
  let iDone = false;
  let myWrite: WriteEntry | null = null;
  if (room.phase === "write") {
    const h = await db.hgetall<WriteEntry>(`room:${code}:words:${room.writeNo}`);
    done = Object.values(h).filter((e) => e.words.length === room.settings.perPlayer).length;
    myWrite = idx >= 0 ? (h[String(idx)] ?? null) : null;
    iDone = myWrite?.words.length === room.settings.perPlayer;
  }

  return {
    code,
    ai: !!room.aiBy,
    phase: room.phase,
    settings: cleanSettings(room.settings), // rooms from before a setting existed get its default
    teamNames: room.teamNames,
    players,
    me: idx,
    isHost: !!me && me.id === room.hostId,
    hostIndex: order.indexOf(room.hostId),
    now,
    round: room.round,
    team: room.team,
    active,
    endsAt: room.endsAt,
    pausedLeft: room.phase === "turn" && room.pausedAt ? Math.max(0, room.endsAt - room.pausedAt) : 0,
    carryMs: room.carryMs,
    word: room.phase === "turn" && !room.pausedAt && idx === active && room.current !== null ? { id: room.current, text: room.words[room.current], hint: room.hints?.[room.current] ?? "" } : null,
    held: room.phase === "turn" && !room.pausedAt && idx === active ? room.held.map((w) => ({ id: w, text: room.words[w] })) : [],
    sheet: drawing(room) && !room.pausedAt ? room.drawNo : null,
    canSkip: room.phase === "turn" && (room.settings.skips === -1 || room.held.length < room.settings.skips) && fresh(room).length > 0,
    bowlLeft: room.bowl.length,
    total: room.words.length,
    turnGot: room.turnGot,
    lastGot: room.lastGot ?? null,
    lastHeckle: room.lastHeckle ?? null,
    heckles: room.phase === "turn" && room.settings.heckle && idx >= 0 && room.teams[idx] !== room.team ? Math.max(0, cleanSettings(room.settings).heckles - (room.heckled?.[idx] ?? 0)) : 0,
    heckleDone: room.phase === "turn" && (room.heckledMs ?? 0) >= heckleBudget(room.endsAt - room.turnStart),
    scores: room.scores,
    lastTurn: room.turns.at(-1) ?? null,
    done,
    iDone,
    myWrite,
    turnNo: room.turnNo,
    stats: room.phase === "end" ? { words: room.words, authors: room.authors, log: room.log, turns: room.turns, drawings: room.drawings ?? [] } : null,
  };
}
