"use client";
// who may use AI on this phone: fetched once from /api/ai/status, refreshed after signing out
import { createContext, useContext, useSyncExternalStore } from "react";
import { aiPref } from "./prefs";

export type Provider = "google" | "github" | "microsoft";
export type AiStatus = { ai: boolean; login: boolean; providers: Provider[]; user: { name: string; email: string; image?: string | null } | null };

let status: AiStatus | null = null;
let loading = false;
const listeners = new Set<() => void>();

async function load() {
  loading = true;
  try {
    status = await fetch("/api/ai/status", { cache: "no-store" }).then((r) => r.json());
  } catch {
    status = { ai: false, login: false, providers: [], user: null };
  }
  loading = false;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  if (!status && !loading) load();
  return () => listeners.delete(l);
};

export const useAiStatus = () => useSyncExternalStore(subscribe, () => status, () => null);
/** AI may be called: it's set up on the server, and sign-in is not required or done */
export const aiAllowed = (s: AiStatus | null) => !!s?.ai && (!s.login || !!s.user);
/** inside a room a signed-in host opened: the credentials that let this phone use AI on the host's budget */
export type AiRoom = { code: string; pid: string; token: string };
export const AiRoomContext = createContext<AiRoom | null>(null);
export const useAiRoom = () => useContext(AiRoomContext);

/** show AI features at all: allowed (signed in, or in a signed-in host's room), and switched on on this phone. Otherwise nothing AI appears */
export function useAiOn() {
  const s = useAiStatus();
  const room = useAiRoom();
  const on = aiPref.use() === "on";
  return on && (aiAllowed(s) || (!!room && !!s?.ai));
}

/** off to the provider and back to this very page */
// the auth client (better-auth) only loads when someone taps sign in or out: every page stays lighter without it
const auth = () => import("./authClient").then((m) => m.authClient);
/** start loading the auth client as the finger lands, so the tap itself doesn't wait for it */
export const warmAuth = () => void auth().catch(() => {});
export const signIn = async (provider: Provider) => (await auth()).signIn.social({ provider, callbackURL: location.pathname + location.search });
export async function signOut() {
  await (await auth()).signOut();
  await load();
}
