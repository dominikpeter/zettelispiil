"use client";
// who may use AI on this phone: fetched once from /api/ai/status, refreshed after signing out
import { useSyncExternalStore } from "react";
import { authClient } from "./authClient";

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
/** AI may be called: sign-in not required, or done */
export const aiAllowed = (s: AiStatus | null) => !!s && (!s.login || !!s.user);

/** off to the provider and back to this very page */
export const signIn = (provider: Provider) => authClient.signIn.social({ provider, callbackURL: location.pathname + location.search });
export async function signOut() {
  await authClient.signOut();
  await load();
}
