// server only: sign-in with Google, GitHub or Microsoft (Better Auth, no database).
// The session lives in an encrypted cookie; it only unlocks the AI features, playing needs no account.
import { betterAuth } from "better-auth";

const env = process.env;
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
  trustedOrigins: ["https://zettelispiil.ch", "https://www.zettelispiil.ch", "http://localhost:3000", "http://localhost:3001"],
  socialProviders: { google, github, microsoft },
  // no database: sessions and the OAuth handshake live in encrypted cookies
  session: { cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 30, strategy: "jwe", refreshCache: true } },
  account: { storeStateStrategy: "cookie", storeAccountCookie: false },
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
