"use client";
// per-device preferences in localStorage; layout.tsx applies theme + palette before first paint
import { useSyncExternalStore } from "react";
import { DICT, type Lang } from "./i18n";

function pref<T extends string>(key: string, allowed: readonly T[], fallback: T, apply?: (v: T) => void) {
  const listeners = new Set<() => void>();
  const get = (): T => {
    try {
      const v = localStorage.getItem(key) as T | null;
      return v && allowed.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };
  const set = (v: T) => {
    try {
      localStorage.setItem(key, v);
    } catch {}
    apply?.(v);
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const use = () => useSyncExternalStore(subscribe, get, () => fallback);
  return { get, set, use };
}

export const THEMES = ["auto", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const PALETTES = [
  { id: "night", swatch: ["#25003d", "#c86bfa", "#ffd500"] },
  { id: "ink", swatch: ["#03071e", "#5068ee", "#ffee32"] },
  { id: "gold", swatch: ["#332b00", "#ffd500", "#8907cf"] },
] as const;
export type Palette = (typeof PALETTES)[number]["id"];

const root = () => document.documentElement;
export const themePref = pref<Theme>("theme", THEMES, "auto", (t) => {
  if (t === "auto") delete root().dataset.theme;
  else root().dataset.theme = t;
});
export const palettePref = pref<Palette>(
  "palette",
  PALETTES.map((p) => p.id),
  "night",
  (p) => (root().dataset.palette = p),
);
export const langPref = pref<Lang>("lang", ["de", "en", "fr"], "de", (l) => (root().lang = l));

/** the dictionary for the chosen language (German until the device says otherwise) */
export const useT = () => DICT[langPref.use()];
