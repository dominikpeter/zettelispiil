// shared look & feel
import { feel } from "./native";
import type { CSSProperties, ReactNode } from "react";
import { Brush, MessageSquareText, PersonStanding, Volume2, WholeWord, type LucideIcon } from "lucide-react";
import type { RoundType } from "./room";

export const press = "transition duration-200 ease-spring active:scale-[0.96]";
export const btn = `flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-cta px-6 text-lg font-bold text-cta-ink shadow-[0_6px_0_var(--color-cta-edge)] active:translate-y-1 active:shadow-[0_2px_0_var(--color-cta-edge)] disabled:opacity-40 disabled:shadow-none disabled:active:translate-y-0 ${press}`;
export const btn2 = `flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-5 font-semibold text-ink hover:bg-raised disabled:opacity-40 ${press}`;
export const ghost = `min-h-11 rounded-xl px-3 font-medium text-muted hover:text-ink hover:bg-surface ${press}`;
export const panel = "rounded-3xl bg-surface p-5";
export const field =
  "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-lg outline-none transition placeholder:text-muted/60 focus:border-accent focus-visible:outline-none";
/** handwritten word that always fits one line: shrinks with its length (needs an `@container` ancestor) */
export const fitLine = (text: string, max = "3.75rem"): CSSProperties => ({
  fontSize: `min(${max}, calc(100cqi / ${(Math.max(4, [...text].length) * 0.5).toFixed(2)}))`,
  whiteSpace: "nowrap",
});

// header controls: one frosted pill holding quiet icon buttons
export const pill = "flex items-center gap-0.5 rounded-full border border-line/70 bg-surface/70 p-1 shadow-sm backdrop-blur-md";
export const pillBtn = `grid size-9 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink ${press}`;
export const round_btn = `grid size-11 place-items-center rounded-full border border-line bg-raised text-2xl leading-none text-ink disabled:opacity-30 ${press}`;

// team colors; the names come from the room
export const TEAM = [
  { text: "text-team-a", bg: "bg-team-a", soft: "bg-team-a/15", border: "border-team-a" },
  { text: "text-team-b", bg: "bg-team-b", soft: "bg-team-b/15", border: "border-team-b" },
  { text: "text-team-c", bg: "bg-team-c", soft: "bg-team-c/15", border: "border-team-c" },
  { text: "text-team-d", bg: "bg-team-d", soft: "bg-team-d/15", border: "border-team-d" },
] as const;

const ROUND_ICON: Record<RoundType, LucideIcon> = { describe: MessageSquareText, pantomime: PersonStanding, oneword: WholeWord, sound: Volume2, draw: Brush };
/** WhatsApp's mark (lucide has no brand icons) */
export function WhatsAppIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`fill-current ${className}`} aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.8h-.01a9.8 9.8 0 0 1-5-1.37l-.36-.21-3.71.97.99-3.62-.23-.37a9.8 9.8 0 0 1-1.5-5.22c0-5.42 4.41-9.83 9.84-9.83 2.63 0 5.1 1.03 6.95 2.88a9.77 9.77 0 0 1 2.88 6.96c0 5.42-4.42 9.82-9.85 9.82zm8.38-18.2A11.77 11.77 0 0 0 12.05 0C5.5 0 .17 5.33.17 11.88c0 2.1.55 4.14 1.59 5.94L.07 24l6.33-1.66a11.87 11.87 0 0 0 5.65 1.44h.01c6.55 0 11.88-5.33 11.88-11.88 0-3.17-1.24-6.16-3.48-8.4z" />
    </svg>
  );
}

/** a WhatsApp link that opens the chat picker with the text ready to send */
export const whatsappHref = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export function RoundIcon({ type, className = "size-6" }: { type: RoundType; className?: string }) {
  const I = ROUND_ICON[type];
  return <I className={className} aria-hidden />;
}

/** the bowl with slips peeking out; `count` sits on its belly */
export function Bowl({ count, className = "w-24", pile = true }: { count?: number; className?: string; pile?: boolean }) {
  return (
    <div className={className}>
      <div className="relative">
      <svg viewBox="0 0 120 80" className="w-full" aria-hidden>
        {pile && count !== 0 && (
          <>
            <rect x="38" y="10" width="20" height="28" rx="2" fill="var(--color-paper)" transform="rotate(-14 48 24)" />
            <rect x="58" y="6" width="20" height="30" rx="2" fill="var(--color-gold-800)" transform="rotate(9 68 21)" />
            <rect x="48" y="14" width="22" height="26" rx="2" fill="var(--color-paper-edge)" transform="rotate(-2 59 27)" />
          </>
        )}
        {/* follows the color theme: a deeper shade of its accent, with the accent as rim */}
        <path d="M6 34h108c0 24-24 42-54 42S6 58 6 34z" style={{ fill: "color-mix(in oklab, var(--color-accent) 55%, #0c0014)" }} />
        <path d="M6 34h108" style={{ stroke: "var(--color-accent)" }} strokeWidth="4" strokeLinecap="round" />
      </svg>
      {count !== undefined && (
        <span key={count} className="bump absolute inset-x-0 bottom-[14%] text-center text-lg font-bold tabular-nums text-white">
          {count}
        </span>
      )}
      </div>
    </div>
  );
}

/** a paper slip; words on it are handwritten */
export function Slip({ children, tilt = -2, className = "", style }: { children: ReactNode; tilt?: number; className?: string; style?: CSSProperties }) {
  return (
    <div className={`slip ${className}`} style={{ "--tilt": `${tilt}deg`, transform: `rotate(${tilt}deg)`, ...style } as CSSProperties}>
      {children}
    </div>
  );
}

/** ring timer: depletes clockwise, turns gold and throbs in the last 5 s */
export function TimerRing({ left, total, size = 120, label }: { left: number; total: number; size?: number; label: (s: number) => string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = total ? Math.max(0, Math.min(1, left / total)) : 0;
  const s = Math.ceil(left / 1000);
  const hot = s <= 5;
  return (
    <div className={`relative ${hot && s > 0 ? "throb" : ""}`} style={{ width: size, height: size }} role="timer" aria-label={label(s)}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-line)" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={r} fill="none" strokeWidth="8" strokeLinecap="round"
          stroke={hot ? "var(--color-hi)" : "var(--color-accent)"}
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.3s" }}
        />
      </svg>
      <span className={`absolute inset-0 grid place-items-center font-bold tabular-nums ${hot ? "text-hi" : "text-ink"}`} style={{ fontSize: size * 0.3 }}>
        {s}
      </span>
    </div>
  );
}

/** one burst of tiny slips falling over the screen */
export function Confetti({ n = 60 }: { n?: number }) {
  const colors = ["var(--color-paper)", "var(--color-gold)", "var(--color-mauve-magic)", "var(--color-bright-lemon)", "var(--color-mauve-magic-800)"];
  // deterministic spread so server and client agree
  const bits = Array.from({ length: n }, (_, i) => {
    const h = (i * 2654435761) % 1000;
    return { left: (i * 37) % 100, dx: `${(h % 30) - 15}vw`, rot: `${(h % 720) - 360}deg`, dur: `${2.4 + (h % 12) / 10}s`, delay: `${(i % 12) * 0.06}s`, c: colors[i % colors.length], w: 6 + (h % 6) };
  });
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {bits.map((b, i) => (
        <span
          key={i}
          className="confetti absolute top-0 rounded-[1px]"
          style={{ left: `${b.left}%`, width: b.w, height: b.w * 1.4, background: b.c, "--dx": b.dx, "--rot": b.rot, "--dur": b.dur, "--delay": b.delay } as CSSProperties}
        />
      ))}
    </div>
  );
}

export const buzz = (p: number | number[]) => feel(p); // real haptics in the phone apps, navigator.vibrate on the web
