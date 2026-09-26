// the one-phone game in progress: its room code and every player's identity, in join order
import { clearLocal, localStore } from "./localStore";
import { createRoom, joinRoom } from "./room";
import { PLAYED_KEY, type Identity } from "./roomClient";
import type { Lang } from "./i18n";

export type LocalGame = { code: string; ids: Identity[] };
const KEY = "zettelispiil:localgame";

export function loadLocalGame(): LocalGame | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

export function saveLocalGame(g: LocalGame) {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {}
}

const PLAYERS_KEY = "zettelispiil:players";
export const DEFAULT_PLAYERS = ["Lisa", "Nora", "Nelly", "Tim"];

// The home page's player list: saved on every edit, so a rename survives a reload or a visit elsewhere (it used to live
// in page state only and was written just when a game started, so old names came back). One copy in memory, the same
// array until it changes (useSyncExternalStore needs that), kept in step with localStorage and with other tabs.
let players: string[] | undefined;
const listeners = new Set<() => void>();
const readPlayers = (): string[] => {
  try {
    const p = JSON.parse(localStorage.getItem(PLAYERS_KEY) ?? "null");
    return Array.isArray(p) ? p : DEFAULT_PLAYERS; // an empty list is a choice too; nothing saved yet: the defaults
  } catch {
    return DEFAULT_PLAYERS;
  }
};

export const loadPlayers = (): string[] => (players ??= readPlayers());

export function savePlayers(next: string[]) {
  players = next;
  try {
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(next));
  } catch {} // private mode: still kept in memory for this visit
  for (const l of listeners) l();
}

export function subscribePlayers(onChange: () => void) {
  const otherTab = (e: StorageEvent) => {
    if (e.key !== PLAYERS_KEY) return;
    players = readPlayers();
    onChange();
  };
  listeners.add(onChange);
  addEventListener("storage", otherTab);
  return () => {
    listeners.delete(onChange);
    removeEventListener("storage", otherTab);
  };
}

/** fresh one-phone game, first player hosts; teams fill alternately; replaces any earlier game */
export async function newLocalGame(players: string[], lang: Lang) {
  savePlayers(players);
  try {
    localStorage.setItem(PLAYED_KEY, "1");
  } catch {}
  clearLocal();
  const r = await createRoom(localStore, players[0], lang);
  const ids = [{ pid: r.pid, token: r.token }];
  for (const name of players.slice(1)) {
    const m = await joinRoom(localStore, r.code, name);
    ids.push({ pid: m.pid, token: m.token });
  }
  saveLocalGame({ code: r.code, ids });
}
