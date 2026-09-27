import { currentUser, getAuth, revokeApple } from "@/lib/auth";
import { forget } from "@/lib/usage";

// POST { appleCode? } → deletes the signed-in account (App Review 5.1.1(v)). There is no user database: an account is its
// record and counters for the admin page and its sessions, so that's what goes. For Sign in with Apple in the app, Apple's
// tokens are revoked too (appleCode: a fresh code from Apple's sheet). The client signs out afterwards, clearing the cookie
export async function POST(req: Request) {
  const user = await currentUser(req);
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  const { appleCode } = ((await req.json().catch(() => ({}))) ?? {}) as { appleCode?: unknown };
  if (typeof appleCode === "string" && appleCode && !(await revokeApple(appleCode).catch(() => false)))
    return Response.json({ error: "apple refused" }, { status: 502 });
  if (!(await forget(user.id))) return Response.json({ error: "not deleted" }, { status: 503 });
  // then its sessions: the server checks them in the store, not the cookie (currentUser), so every copy is out at once.
  // If this fails, say so: the phone is still signed in and can try again (forgetting twice is harmless)
  try {
    await getAuth()!.api.revokeSessions({ headers: req.headers });
  } catch {
    return Response.json({ error: "sessions not ended" }, { status: 503 });
  }
  return Response.json({ ok: true });
}
