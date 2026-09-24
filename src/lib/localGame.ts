// the one-phone game in progress: its room code and every player's identity, in join order
import { clearLocal, localStore } from "./localStore";
import { createRoom } from "./room";
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

/** fresh one-phone game with the host as first player; replaces any earlier one */
export async function newLocalGame(hostName: string, lang: Lang) {
  clearLocal();
  const r = await createRoom(localStore, hostName, lang);
  saveLocalGame({ code: r.code, ids: [{ pid: r.pid, token: r.token }] });
}
