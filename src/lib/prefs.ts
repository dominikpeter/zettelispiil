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
  { id: "postit", swatch: ["#ffe14d", "#ff8fc6", "#7cc8ff"] },
  { id: "night", swatch: ["#25003d", "#c86bfa", "#ffd500"] },
  { id: "ink", swatch: ["#03071e", "#5068ee", "#ffee32"] },
  { id: "gold", swatch: ["#332b00", "#ffd500", "#8907cf"] },
  { id: "sunset", swatch: ["#003049", "#f77f00", "#fcbf49"] },
  { id: "ocean", swatch: ["#00131d", "#50c2ff", "#d62828"] },
  { id: "arosa", swatch: ["#0a1fd6", "#ffe000", "#ffffff"] },
  { id: "aarau", swatch: ["#111111", "#e30613", "#ffffff"] },
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
  "postit",
  (p) => (root().dataset.palette = p),
);
/** AI help while writing (spelling, difficulty, hints) and for funny names; on unless this phone switched it off */
export const aiPref = pref<"on" | "off">("ai", ["on", "off"], "on");
/** show the (AI) hint under the Zetteli while describing; only counts while AI help is on */
export const hintPref = pref<"on" | "off">("hints", ["on", "off"], "on");
export const useHints = () => aiPref.use() === "on" && hintPref.use() === "on";
export const langPref = pref<Lang>("lang", ["de", "en", "fr"], "de", (l) => (root().lang = l));

/** the dictionary for the chosen language (German until the device says otherwise) */
export const useT = () => DICT[langPref.use()];
