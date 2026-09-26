// server only: sign-in with Google, GitHub, Microsoft or a code by email (Better Auth, no database).
// The session lives in an encrypted cookie; it only unlocks the AI features, playing needs no account.
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins/email-otp";
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./store";
import { signedIn } from "./usage";

const env = process.env;
const limiters = new Map<string, Ratelimit>();
const pair = (id?: string, secret?: string) => (id && secret ? { clientId: id, clientSecret: secret } : undefined);

// a provider is on only when both of its keys are set
const google = pair(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
const github = pair(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET);
const microsoftKeys = pair(env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET);
const microsoft = microsoftKeys && { ...microsoftKeys, tenantId: "common", prompt: "select_account" as const }; // personal and work accounts

// a code by email (Resend). The e2e server has no mail: it uses a fixed code, never on Vercel
const mail = env.RESEND_API_KEY && env.EMAIL_FROM ? { key: env.RESEND_API_KEY, from: env.EMAIL_FROM } : undefined;
const fixedOtp = !env.VERCEL && !mail ? env.E2E_FIXED_OTP : undefined;
const email = !!(mail || fixedOtp);

export const PROVIDERS = (["google", "github", "microsoft", "email"] as const).filter((p) => ({ google, github, microsoft, email })[p]);
export type Provider = (typeof PROVIDERS)[number];
/** sign-in is required for AI only when it's actually set up */
export const authEnabled = () => !!env.BETTER_AUTH_SECRET && PROVIDERS.length > 0;

// built only once sign-in is set up: without its secret Better Auth refuses to run in production
const make = () => betterAuth({
  // Redis holds the email codes (and sessions) so every serverless instance sees them; without Redis (local, e2e) memory does
  ...(redis && {
    secondaryStorage: {
      // stored as JSON strings; Upstash parses JSON on read, so it's turned back into a string
      get: async (k: string) => str(await redis!.get(`auth:${k}`)),
      getAndDelete: async (k: string) => str(await redis!.getdel(`auth:${k}`)),
      set: async (k: string, v: string, ttl?: number) => void (ttl ? await redis!.set(`auth:${k}`, v, { ex: ttl }) : await redis!.set(`auth:${k}`, v)),
      delete: async (k: string) => void (await redis!.del(`auth:${k}`)),
      // one transaction: the TTL is set only when the counter is new, and never lost
      increment: async (k: string, ttl: number) => (await redis!.multi().incr(`auth:${k}`).expire(`auth:${k}`, ttl, "NX").exec<[number, number]>())[0],
    },
  }),
  plugins: email
    ? [
        emailOTP({
          expiresIn: 600,
          allowedAttempts: 3,
          ...(fixedOtp && { generateOTP: () => fixedOtp }),
          sendVerificationOTP: async ({ email, otp }) => {
            if (!mail) return; // e2e: the code is fixed
            // every address can be typed in: at most 5 codes per address and hour, so nobody floods an inbox (or our Resend quota)
            if (redis && !(await mailLimit().limit(email.toLowerCase())).success) throw new APIError("TOO_MANY_REQUESTS");
            const r = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${mail.key}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from: mail.from, to: [email], subject: `Zettelispiil: ${otp}`, text: codeMail(otp) }),
              signal: AbortSignal.timeout(8000), // a hanging mail service must not hold the request
            });
            if (!r.ok) throw new APIError("BAD_GATEWAY", { message: "mail not sent" });
          },
        }),
      ]
    : [],
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
    customRules: { "/sign-in/*": { window: 10, max: 20 }, "/email-otp/send-verification-otp": { window: 60, max: 3 } },
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
  // a finished sign-in (the provider sent the player back): remember who, for the admin page
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const s = ctx.context.newSession;
      if (!s) return;
      const user = { ...s.user, id: accountOf(s.user) };
      if (ctx.path.startsWith("/callback/")) await signedIn(user, ctx.path.slice("/callback/".length));
      else if (ctx.path === "/sign-in/email-otp") await signedIn(user, "email");
    }),
  },
});
const str = (v: unknown) => (v == null ? null : typeof v === "string" ? v : JSON.stringify(v));
let mailLimiter: Ratelimit | null = null;
const mailLimit = () => (mailLimiter ??= new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(5, "1 h"), prefix: "ratelimit:mail" }));
const codeMail = (otp: string) =>
  `Dein Code für Zettelispiil: ${otp}\nYour Zettelispiil code: ${otp}\nTon code Zettelispiil : ${otp}\n\nEr gilt 10 Minuten. Valid for 10 minutes. Valable 10 minutes.\n\nNicht angefragt? Einfach ignorieren. Didn't ask for it? Just ignore this mail.`;

let instance: ReturnType<typeof make> | null = null;
export const getAuth = () => (authEnabled() ? (instance ??= make()) : null);

/**
 * the account behind a user: its email. Without a database Better Auth makes up a fresh user id at each sign-in,
 * so an id would give every sign-in new AI limits; the (provider-verified) email stays the same.
 */
export const accountOf = (u: { id: string; email?: string | null }) => (u.email ? u.email.trim().toLowerCase() : u.id);

/** the signed-in user of a request (its id is the account, see accountOf), or null */
export async function currentUser(req: Request) {
  if (!authEnabled()) return null;
  try {
    const u = (await getAuth()!.api.getSession({ headers: req.headers }))?.user;
    return u ? { ...u, id: accountOf(u) } : null;
  } catch {
    return null;
  }
}
