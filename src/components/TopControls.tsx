"use client";

import { Heart, Moon, Settings, Sparkles, Sun, SunMoon, X } from "lucide-react";
import { Account } from "./Account";
import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { LANGS } from "@/lib/i18n";
import { aiPref, hintPref, langPref, palettePref, PALETTES, themePref, THEMES, useT } from "@/lib/prefs";
import { pill, pillBtn, press } from "@/lib/ui";

const dark = "(prefers-color-scheme: dark)";
const onSystemChange = (cb: () => void) => {
  const m = matchMedia(dark);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

const round = `grid size-11 place-items-center rounded-full border border-line bg-surface text-ink ${press}`;

/** segmented control with a sliding indicator (transform only) */
export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className="relative grid rounded-2xl border border-line bg-canvas p-1 text-sm font-semibold" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 rounded-xl bg-accent transition-transform duration-300 ease-spring"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${i * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={o.id === value}
          className={`relative z-10 flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 transition-colors duration-300 ${o.id === value ? "text-canvas" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** language, appearance and colors; saved on this phone, so every player picks their own */
export function SettingsPanel() {
  const t = useT();
  const theme = themePref.use();
  const palette = palettePref.use();
  const lang = langPref.use();
  const ai = aiPref.use();
  const hints = hintPref.use();
  const icon = { auto: SunMoon, light: Sun, dark: Moon };
  return (
    <>
      <section className="flex flex-col gap-3 empty:hidden">
        <Account />
      </section>
      <section className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 shrink-0 text-accent" aria-hidden /> {t.aiHelp}
          </h3>
          <p className="text-sm leading-snug text-muted">{t.aiHelpNote}</p>
        </div>
        <div className="w-36 shrink-0">
          <Segmented options={[{ id: "on" as const, label: t.on }, { id: "off" as const, label: t.off }]} value={ai} onChange={aiPref.set} />
        </div>
      </section>
      <fieldset disabled={ai !== "on"} className={`flex items-center justify-between gap-4 transition-opacity ${ai === "on" ? "" : "opacity-40"}`}>
        <div className="min-w-0">
          <h3 className="font-semibold">{t.showHints}</h3>
          <p className="text-sm leading-snug text-muted">{t.showHintsNote}</p>
        </div>
        <div className="w-36 shrink-0">
          <Segmented options={[{ id: "on" as const, label: t.on }, { id: "off" as const, label: t.off }]} value={ai === "on" ? hints : "off"} onChange={hintPref.set} />
        </div>
      </fieldset>

          <section className="flex flex-col gap-2">
        <h3 className="font-semibold">{t.language}</h3>
        <Segmented options={LANGS.map((l) => ({ id: l.id, label: l.label }))} value={lang} onChange={langPref.set} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">{t.appearance}</h3>
        <Segmented
          options={THEMES.map((id) => {
            const I = icon[id];
            return {
              id,
              label: (
                <>
                  <I className="size-4" aria-hidden />
                  {id === "auto" ? t.themeAuto : id === "light" ? t.themeLight : t.themeDark}
                </>
              ),
            };
          })}
          value={theme}
          onChange={themePref.set}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">{t.colors}</h3>
        <div className="grid grid-cols-3 gap-2">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              onClick={() => palettePref.set(p.id)}
              aria-pressed={palette === p.id}
              className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 font-semibold ${press} ${palette === p.id ? "border-accent bg-raised" : "border-line"}`}
            >
              <span className="flex -space-x-2" aria-hidden>
                {p.swatch.map((c) => (
                  <span key={c} className="size-7 rounded-full ring-2 ring-surface" style={{ background: c }} />
                ))}
              </span>
              {t[`palette_${p.id}`]}
            </button>
          ))}
        </div>
      </section>
      <footer className="flex items-center justify-center gap-1.5 pt-2 text-sm text-muted">
        {t.madeWith} <Heart className="size-4 fill-accent text-accent" aria-label="♥" /> {t.madeBy("Dominik")} ·
        <a href="https://github.com/dominikpeter/zettelispiil" target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline-offset-4 hover:underline">
          GitHub
        </a>
      </footer>
    </>
  );
}

/** header right side: quick light/dark toggle + settings sheet (language, appearance, colors) */
export function TopControls() {
  const t = useT();
  const theme = themePref.use();
  const systemDark = useSyncExternalStore(onSystemChange, () => matchMedia(dark).matches, () => true);
  const isDark = theme === "dark" || (theme === "auto" && systemDark);
  const sheet = useRef<HTMLDialogElement>(null);

  return (
    <div className={pill}>
      <button onClick={() => themePref.set(isDark ? "light" : "dark")} aria-label={t.toggleTheme} className={pillBtn}>
        <span key={String(isDark)} className="pop">
          {isDark ? <Moon className="size-[1.15rem]" strokeWidth={2.25} aria-hidden /> : <Sun className="size-[1.15rem]" strokeWidth={2.25} aria-hidden />}
        </span>
      </button>
      <button onClick={() => sheet.current?.showModal()} aria-label={t.settings} className={pillBtn}>
        <Settings className="size-[1.15rem]" strokeWidth={2.25} aria-hidden />
      </button>

      <dialog
        ref={sheet}
        onClick={(e) => e.target === sheet.current && sheet.current.close()} // tap outside closes
        className="sheet mx-auto mt-auto mb-0 max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-surface p-0 text-ink backdrop:bg-black/60 sm:mb-auto sm:rounded-3xl"
      >
        <div className="flex flex-col gap-5 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
              <Settings className="size-6 text-accent" aria-hidden /> {t.settings}
            </h2>
            <button onClick={() => sheet.current?.close()} aria-label={t.close} className={round}>
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <SettingsPanel />
        </div>
      </dialog>
    </div>
  );
}
