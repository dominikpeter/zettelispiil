// server only: sign-in with Google, GitHub or Microsoft (Better Auth, no database).
// The session lives in an encrypted cookie; it only unlocks the AI features, playing needs no account.
import { betterAuth } from "better-auth";
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./store";

const env = process.env;
const limiters = new Map<string, Ratelimit>();
const pair = (id?: string, secret?: string) => (id && secret ? { clientId: id, clientSecret: secret } : undefined);

// a provider is on only when both of its keys are set
const google = pair(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
const github = pair(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET);
const microsoftKeys = pair(env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET);
const microsoft = microsoftKeys && { ...microsoftKeys, tenantId: "common", prompt: "select_account" as const }; // personal and work accounts

export const PROVIDERS = (["google", "github", "microsoft"] as const).filter((p) => ({ google, github, microsoft })[p]);
export type Provider = (typeof PROVIDERS)[number];
/** sign-in is required for AI only when it's actually set up */
export const authEnabled = () => !!env.BETTER_AUTH_SECRET && PROVIDERS.length > 0;

// built only once sign-in is set up: without its secret Better Auth refuses to run in production
const make = () => betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL, // unset in dev: taken from the request
  // sign-in may only send people back to these; localhost only outside production
  trustedOrigins: ["https://zettelispiil.ch", "https://www.zettelispiil.ch", ...(env.NODE_ENV === "production" ? [] : ["http://localhost:3000", "http://localhost:3001"])],
  socialProviders: { google, github, microsoft },
  // no database: sessions and the OAuth handshake live in encrypted cookies; they can't be revoked, so they last a week, not a month
  session: { cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 7, strategy: "jwe", refreshCache: true } },
  account: { storeStateStrategy: "cookie", storeAccountCookie: false },
  // serverless instances don't share memory: count auth requests in Redis, keyed by Vercel's own client IP header (clients can't spoof it)
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    // Better Auth allows 3 sign-ins per 10 s by default; a table of friends signing in together shares one IP
    customRules: { "/sign-in/*": { window: 10, max: 20 } },
    // atomic check-and-count in Redis; without Redis (local dev) Better Auth's memory store is fine
    ...(redis && {
      customStorage: {
        consume: async (key, { window, max }) => {
          const id = `${max}/${window}`;
          if (!limiters.has(id)) limiters.set(id, new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(max, `${window} s`), prefix: `ratelimit:auth:${id}` }));
          const r = await limiters.get(id)!.limit(key);
          return { allowed: r.success, retryAfter: r.success ? null : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)) };
        },
      },
    }),
  },
  advanced: { ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for", "x-real-ip"] } },
});
let instance: ReturnType<typeof make> | null = null;
export const getAuth = () => (authEnabled() ? (instance ??= make()) : null);

/** the signed-in user of a request, or null */
export async function currentUser(req: Request) {
  if (!authEnabled()) return null;
  try {
    return (await getAuth()!.api.getSession({ headers: req.headers }))?.user ?? null;
  } catch {
    return null;
  }
}
