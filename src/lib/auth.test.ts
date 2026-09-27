import { test } from "node:test";
import assert from "node:assert/strict";

test("account deletion rejects independent and cached sessions after a fresh sign-in", async (t) => {
  // Isolated test process: no real mail, provider, Redis or deployment is touched.
  if (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.VERCEL) return t.skip("local auth regression only");
  process.env.BETTER_AUTH_SECRET = "local-unit-test-only-auth-secret-value";
  process.env.BETTER_AUTH_URL = "http://localhost:3001";
  process.env.E2E_FIXED_OTP = "123456";
  process.env.RESEND_API_KEY = "";
  const { getAuth, currentUser } = await import("./auth.ts");
  const { POST: deleteAccount } = await import("../app/api/account/delete/route.ts");
  const { betterAuth } = await import("better-auth");
  const auth = getAuth()!;
  // A second server instance has its own database-less user IDs, just like separate serverless instances.
  const otherServer = betterAuth(auth.options);
  const email = "several-devices@example.ch";
  const call = (path: string, cookie = "", body?: unknown, server = auth) => server.handler(new Request(`http://localhost:3001/api/auth${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", origin: "http://localhost:3001", cookie, "x-real-ip": "127.0.0.1" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  const login = async (server = auth) => {
    assert.equal((await call("/email-otp/send-verification-otp", "", { email, type: "sign-in" }, server)).status, 200);
    const response = await call("/sign-in/email-otp", "", { email, otp: "123456" }, server);
    assert.equal(response.status, 200);
    return response.headers.getSetCookie().map((c) => c.split(";", 1)[0]).join("; ");
  };
  const user = (cookie: string) => currentUser({ headers: new Headers({ cookie }) });
  const first = await login();
  const second = await login(otherServer);
  const otherSession = () => otherServer.api.getSession({ headers: new Headers({ cookie: second }), query: { disableCookieCache: true } });
  assert.equal((await user(first))?.email, email);
  assert.equal((await otherSession())?.user.email, email);
  const firstSession = await auth.api.getSession({ headers: new Headers({ cookie: first }) });
  assert.notEqual(firstSession?.user.id, (await otherSession())?.user.id);
  const response = await deleteAccount(new Request("http://localhost:3001/api/account/delete", {
    method: "POST", headers: { cookie: first, "content-type": "application/json" }, body: "{}",
  }));
  assert.equal(response.status, 200);
  assert.equal(await user(first), null);
  assert.equal(await otherSession(), null);
  // Exercise the public cookie-cache/refresh path too, not just the application's authoritative lookup.
  assert.equal(await (await call("/get-session", second, undefined, otherServer)).json(), null);
  const fresh = await login();
  assert.equal((await user(fresh))?.email, email);
  assert.equal(await user(first), null);
  assert.equal(await otherSession(), null);
  assert.equal(await (await call("/get-session", second, undefined, otherServer)).json(), null);
});
