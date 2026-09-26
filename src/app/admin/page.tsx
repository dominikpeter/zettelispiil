// owner-only usage page. Rendered on the server for the account(s) in ADMIN_EMAIL (verified email only);
// everyone else gets a plain 404. German only: it has one reader.
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { refresh } from "next/cache";
import { Power } from "lucide-react";
import { Account } from "@/components/Account";
import { getAuth } from "@/lib/auth";
import { report, type Day } from "@/lib/usage";
import { aiSwitchedOff, setAiSwitch } from "@/lib/aiSwitch";
import { btn, btn2, panel } from "@/lib/ui";

export const metadata: Metadata = { title: "Admin · Zettelispiil", robots: { index: false, follow: false } };

const admins = () => (process.env.ADMIN_EMAIL ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const isAdmin = (u: { email: string; emailVerified: boolean } | undefined): u is { email: string; emailVerified: boolean } =>
  !!u && u.emailVerified && admins().includes(u.email.toLowerCase());
const me = async () => (await getAuth()?.api.getSession({ headers: await headers() }))?.user;

/** the switch: AI on or off for everyone. Checked again here, a form post can come from anyone */
async function switchAi(form: FormData) {
  "use server";
  if (!isAdmin(await me())) throw new Error("not allowed");
  await setAiSwitch(form.get("ai") === "on");
  refresh();
}
const fmt = (n: number) => n.toLocaleString("de-CH");
const when = (t: number) => new Date(t).toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zurich" });
// USD per million tokens (Sep 2026). gpt-oss-120b on OpenRouter: 0.15 in, 0.60 out. gpt-6-luna: list price; its priority lane
// costs more, so that's the floor
const PRICE = process.env.OPENROUTER_API_KEY ? { in: 0.15, out: 0.6 } : { in: 0.1, out: 0.5 };
const usd = (tokIn: number, tokOut: number) => (tokIn * PRICE.in + tokOut * PRICE.out) / 1e6;
const money = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;
const sum = (days: Day[], ...keys: (keyof Day)[]) => days.reduce((s, d) => s + keys.reduce((t, k) => t + (Number(d[k]) || 0), 0), 0);

export default async function Admin() {
  const auth = getAuth();
  if (!auth || !admins().length) notFound(); // sign-in or the admin list isn't set up: there is no admin page
  const user = await me();
  if (!user)
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Admin</h1>
        <Account />
      </main>
    );
  if (!isAdmin(user)) notFound();

  const [{ days, accounts, live }, aiOff] = await Promise.all([report(30), aiSwitchedOff()]);
  const today = days.at(-1)!;
  const tokens = (k: "check" | "names" | "ideas" | "zetteli") => sum(days, `tokens_in_${k}`, `tokens_out_${k}`);
  const tiles = [
    ["Räume", sum(days, "rooms")],
    ["Spiele gestartet", sum(days, "games")],
    ["Beitritte", sum(days, "joins")],
    ["Anmeldungen", sum(days, "signins")],
    ["KI-Aufrufe", sum(days, "ai_check", "ai_names", "ai_ideas", "ai_zetteli")],
    ["Tokens", tokens("check") + tokens("names") + tokens("ideas") + tokens("zetteli")],
    ["Kaffees", sum(days, "coffees")],
    ["Kaffee-CHF", Math.round(sum(days, "coffee_rappen") / 100)],
  ] as const;
  const cost = usd(sum(days, "tokens_in_check", "tokens_in_names", "tokens_in_ideas", "tokens_in_zetteli"), sum(days, "tokens_out_check", "tokens_out_names", "tokens_out_ideas", "tokens_out_zetteli"));
  const fromCache = sum(days, "cache_check", "cache_names", "cache_ideas", "cache_zetteli");
  const asked = sum(days, "ai_check", "ai_names", "ai_ideas", "ai_zetteli");
  const max = Math.max(1, ...days.map((d) => d.games ?? 0));
  const W = 300;
  const H = 90;
  const bw = W / days.length;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Admin</h1>
          <p className="text-sm text-muted">Letzte 30 Tage · heute {fmt(today.games ?? 0)} Spiele</p>
        </div>
        <p className="text-right text-xs text-muted">{user.email}</p>
      </header>
      {!live && <p className={`${panel} text-sm text-muted`}>Keine Redis-Verbindung: hier wird nichts gezählt.</p>}

      <section className={`${panel} flex flex-wrap items-center justify-between gap-3`}>
        <div className="min-w-0">
          <h2 className="font-bold">KI für alle</h2>
          <p className="text-sm text-muted">{aiOff ? "Aus: niemand sieht KI-Funktionen, es gibt keine KI-Aufrufe." : "An: angemeldete Spieler (und ihre Räume) nutzen die KI."}</p>
        </div>
        <form action={switchAi}>
          <input type="hidden" name="ai" value={aiOff ? "on" : "off"} />
          <button className={`${aiOff ? btn : btn2} w-auto! flex items-center gap-2 px-5`}>
            <Power className="size-4" aria-hidden /> {aiOff ? "KI einschalten" : "KI ausschalten"}
          </button>
        </form>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, n]) => (
          <div key={label} className={`${panel} flex flex-col gap-1`}>
            <span className="text-sm text-muted">{label}</span>
            <span className="text-3xl font-extrabold tabular-nums">{fmt(n)}</span>
          </div>
        ))}
        <div className={`${panel} flex flex-col gap-1`}>
          <span className="text-sm text-muted">KI-Kosten (mind.)</span>
          <span className="text-3xl font-extrabold tabular-nums">{money(cost)}</span>
        </div>
        <div className={`${panel} flex flex-col gap-1`}>
          <span className="text-sm text-muted">Aus dem Cache</span>
          <span className="text-3xl font-extrabold tabular-nums">{asked + fromCache ? Math.round((fromCache / (asked + fromCache)) * 100) : 0}%</span>
        </div>
      </section>

      <section className={panel}>
        <h2 className="font-bold">Spiele pro Tag</h2>
        <svg viewBox={`0 0 ${W} ${H + 14}`} className="mt-3 w-full" role="img" aria-label="Gestartete Spiele pro Tag, letzte 30 Tage">
          <line x1="0" x2={W} y1={H} y2={H} className="stroke-line" strokeWidth="1" />
          {days.map((d, i) => {
            const h = ((d.games ?? 0) / max) * (H - 4);
            return (
              <g key={d.day}>
                <title>{`${d.day}: ${d.games ?? 0} Spiele, ${d.rooms ?? 0} Räume`}</title>
                <rect x={i * bw} y="0" width={bw} height={H} fill="transparent" />
                {h > 0 && <rect x={i * bw + 1} y={H - h} width={bw - 2} height={h} rx="2" style={{ fill: "var(--color-chart-a)" }} />}
              </g>
            );
          })}
          <text x="0" y={H + 12} className="fill-muted text-[8px]">{days[0].day.slice(5)}</text>
          <text x={W} y={H + 12} textAnchor="end" className="fill-muted text-[8px]">heute</text>
        </svg>
      </section>

      <section className={panel}>
        <h2 className="font-bold">KI nach Funktion</h2>
        <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 font-medium">Funktion</th>
              <th className="py-1 text-right font-medium">Aufrufe</th>
              <th className="py-1 text-right font-medium">Cache</th>
              <th className="py-1 text-right font-medium">Tokens rein</th>
              <th className="py-1 text-right font-medium">Tokens raus</th>
              <th className="py-1 text-right font-medium">Kosten</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Rechtschreibung & Hinweise", "check"],
                ["Namen", "names"],
                ["Ideen", "ideas"],
                ["KI schreibt die Zetteli", "zetteli"],
              ] as const
            ).map(([label, k]) => (
              <tr key={k} className="border-t border-line">
                <td className="py-1.5">{label}</td>
                <td className="py-1.5 text-right">{fmt(sum(days, `ai_${k}`))}</td>
                <td className="py-1.5 text-right">{fmt(sum(days, `cache_${k}`))}</td>
                <td className="py-1.5 text-right">{fmt(sum(days, `tokens_in_${k}`))}</td>
                <td className="py-1.5 text-right">{fmt(sum(days, `tokens_out_${k}`))}</td>
                <td className="py-1.5 text-right">{money(usd(sum(days, `tokens_in_${k}`), sum(days, `tokens_out_${k}`)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className={panel}>
        <h2 className="font-bold">Konten ({accounts.length})</h2>
        {accounts.length ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Name</th>
                  <th className="py-1 pr-3 font-medium">Über</th>
                  <th className="py-1 pr-3 text-right font-medium">Anmeldungen</th>
                  <th className="py-1 pr-3 text-right font-medium">KI</th>
                  <th className="py-1 font-medium">Zuletzt</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-3">
                      <span className="font-semibold">{a.name || "–"}</span>
                      <span className="block text-xs text-muted">{a.email}</span>
                    </td>
                    <td className="py-1.5 pr-3 capitalize">{a.provider}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(a.signins)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(a.ai)}</td>
                    <td className="py-1.5 whitespace-nowrap text-muted">{when(a.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Noch niemand angemeldet.</p>
        )}
      </section>
    </main>
  );
}
