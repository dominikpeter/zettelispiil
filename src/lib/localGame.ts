// the one-phone game in progress: its room code and every player's identity, in join order
import { clearLocal, localStore } from "./localStore";
import { createRoom, joinRoom } from "./room";
import type { Identity } from "./roomClient";
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
export const DEFAULT_PLAYERS = ["Lisa", "Nora", "Tim", "Beni"];

export function loadPlayers(): string[] {
  try {
    const p = JSON.parse(localStorage.getItem(PLAYERS_KEY) ?? "null");
    return Array.isArray(p) && p.length ? p : DEFAULT_PLAYERS;
  } catch {
    return DEFAULT_PLAYERS;
  }
}

/** fresh one-phone game, first player hosts; teams fill alternately; replaces any earlier game */
export async function newLocalGame(players: string[], lang: Lang) {
  try {
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
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
