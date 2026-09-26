import { devices, expect, test, type Page } from "@playwright/test";
import { closePhonesAfterEach, phone as openPhone } from "./phones";

closePhonesAfterEach();

// Sign-in unlocks the AI features. Signed out, nothing AI shows anywhere; a room opened by a signed-in host lends AI to everyone in it.
// /api/ai/status is mocked to switch sign-in on (the local test server has no OAuth keys); the last test uses the real providers.
const PROVIDERS = ["google", "github", "microsoft"];
const status = (page: Page, user: { name: string; email: string } | null) =>
  page.route("**/api/ai/status", (r) => r.fulfill({ json: { ai: true, login: true, providers: PROVIDERS, user } }));
const aiButtons = (page: Page) => page.getByRole("button", { name: /Lustigen Namen erfinden/ });
const openSettings = (page: Page) => page.getByRole("button", { name: "Einstellungen", exact: true }).first().click();

test("signed out: no AI anywhere, sign-in only in the settings sheet", async ({ page }) => {
  await status(page, null);
  let aiCalls = 0;
  await page.route("**/api/ai/**", (r) => (r.request().url().endsWith("/status") ? r.fallback() : (aiCalls++, r.fulfill({ json: { ai: false } }))));
  await page.goto("/");
  await expect(page.getByLabel(/Spieler 1/)).toBeVisible();
  await expect(aiButtons(page)).toHaveCount(0); // home: no sparkle next to player names

  await openSettings(page);
  for (const p of ["Google", "GitHub", "Microsoft"]) await expect(page.getByRole("button", { name: `Mit ${p} anmelden` })).toBeVisible();
  await expect(page.getByRole("heading", { name: "KI-Hilfe" })).toBeVisible(); // AI help and signing in belong together
  await expect(page.getByRole("button", { name: "Aus", exact: true })).toHaveCount(0); // but no AI switch before signing in
  await expect(page.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/dominikpeter/zettelispiil"); // the credit line
  await expect(page.getByRole("link", { name: "Zettelispiil per WhatsApp teilen" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=.*zettelispiil\.ch/); // recommend the app
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  await expect(aiButtons(page)).toHaveCount(0); // lobby: no sparkle for team or player names
  await page.getByRole("button", { name: "Spiel starten" }).click();
  await page.getByRole("button", { name: /^Ich bin / }).click();
  await page.getByLabel("Zetteli 1", { exact: true }).fill("Matterhon");
  await expect(page.getByLabel(/^Thema/)).toHaveCount(0); // no AI ideas
  await expect(page.getByRole("button", { name: /anmelden$/ })).toHaveCount(0); // and no sign-in nagging while writing
  await page.waitForTimeout(1500);
  expect(aiCalls).toBe(0); // nothing was sent to the AI
});

test("signed in: AI features show, the settings sheet names the account, and switching AI off hides them again", async ({ page }) => {
  await status(page, { name: "Lisa Muster", email: "lisa@example.ch" });
  const bases: string[] = [];
  await page.route("**/api/ai/names", async (r) => {
    const { base } = r.request().postDataJSON();
    bases.push(base);
    await r.fulfill({ json: { ai: true, names: [`Alphornbläser-${base}`] } });
  });
  await page.goto("/");
  await expect(aiButtons(page).first()).toBeVisible();

  // a name typed already gets dressed up, not replaced; pressing again starts from the typed name, not the suggestion
  const lisa = page.getByLabel("Spieler 1", { exact: true });
  await expect(lisa).toHaveValue("Lisa");
  await page.getByRole("button", { name: "Spieler 1: Lustigen Namen erfinden" }).click();
  await expect(lisa).toHaveValue("Alphornbläser-Lisa");
  await page.getByRole("button", { name: "Spieler 1: Lustigen Namen erfinden" }).click();
  await expect.poll(() => bases).toEqual(["Lisa", "Lisa"]);
  await openSettings(page);
  await expect(page.getByText("Lisa Muster")).toBeVisible();
  await expect(page.getByRole("heading", { name: "KI-Hilfe" })).toBeVisible();
  await page.getByRole("button", { name: "Aus" }).first().click(); // AI help off on this phone
  await page.keyboard.press("Escape");
  await expect(aiButtons(page)).toHaveCount(0);
});

test("a room opened by a signed-in host: a guest without an account gets AI, and its calls carry the room pass", async ({ browser }) => {
  const phone = (b: typeof browser) => openPhone(b, { ...devices["Pixel 7"] });
  const host = await phone(browser);
  await status(host, null);
  await host.goto("/");
  await host.getByRole("button", { name: /Mehrere Handys/ }).click();
  await host.getByLabel("Dein Name").fill("Lisa");
  await host.getByRole("button", { name: "Raum erstellen" }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{5}$/);
  const code = host.url().split("/").pop()!;

  // the guest's server answers as for a room whose host was signed in when creating it (the test server has no real sign-in)
  const guest = await phone(browser);
  await status(guest, null);
  await guest.route(`**/api/rooms/${code}`, async (r) => {
    if (r.request().method() !== "GET") return r.fallback();
    const res = await r.fetch();
    await r.fulfill({ response: res, json: { ...(await res.json()), ai: true } });
  });
  const sent: { room?: { code: string; pid: string; token: string } }[] = [];
  await guest.route("**/api/ai/check", async (r) => {
    const body = r.request().postDataJSON();
    sent.push(body);
    await r.fulfill({ json: { ai: true, results: body.words.map((w: string) => ({ word: w, corrected: w, tooHard: false, reason: "", hint: `Tipp zu ${w}` })) } });
  });
  await guest.goto(`/r/${code}`);
  await guest.getByLabel("Dein Name").fill("Nora");
  await guest.getByRole("button", { name: "Beitreten" }).click();
  await expect(guest.getByText("KI-Hilfe für alle")).toBeVisible();
  await expect(host.getByText("KI-Hilfe für alle")).toHaveCount(0); // the real room has no AI: the host isn't signed in
  await expect(aiButtons(host)).toHaveCount(0);
  await openSettings(guest); // the guest can still switch AI help off on their phone
  await expect(guest.getByRole("heading", { name: "KI-Hilfe" })).toBeVisible();
  await guest.keyboard.press("Escape");

  for (const n of ["Tim", "Beni"]) {
    const p = await phone(browser);
    await p.goto(`/r/${code}`);
    await p.getByLabel("Dein Name").fill(n);
    await p.getByRole("button", { name: "Beitreten" }).click();
    await expect(p.getByText("(du)")).toBeVisible();
  }
  for (let i = 0; i < 3; i++) await host.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await host.getByRole("button", { name: "Spiel starten" }).click();

  await guest.getByLabel("Zetteli 1", { exact: true }).fill("Raclette");
  await expect(guest.getByLabel(/Zetteli 1: Hinweis/)).toHaveValue("Tipp zu Raclette"); // the AI answered the guest
  await expect(guest.getByLabel(/^Thema/)).toBeVisible(); // ideas too
  expect(sent.at(-1)?.room).toMatchObject({ code }); // sent with the room pass the server checks
  expect(sent.at(-1)?.room?.token).toBeTruthy();
});

test("the sign-in buttons lead to Google and GitHub (live providers)", async ({ page, request }) => {
  const s = await (await request.get("/api/ai/status")).json();
  test.skip(!s.login, "sign-in is not set up on this server (run against zettelispiil.ch: just e2e-prod)");
  for (const [p, host] of [["Google", "accounts.google.com"], ["GitHub", "github.com"]] as const) {
    if (!s.providers.includes(p.toLowerCase())) continue;
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: `Mit ${p} anmelden` }).click();
    await page.waitForURL((u) => u.hostname === host);
    // the way back to us; GitHub tucks it (encoded twice) into return_to on its login page
    expect(decodeURIComponent(decodeURIComponent(page.url()))).toContain("zettelispiil.ch/api/auth/callback/");
  }
});

test("the admin page shows nothing to anyone else", async ({ page }) => {
  const res = await page.goto("/admin");
  // locally (no sign-in set up) there is no admin page at all; on the live site a stranger only gets the sign-in
  if (res?.status() !== 404) await expect(page.getByRole("button", { name: /anmelden$/ }).first()).toBeVisible();
  for (const secret of ["KI nach Funktion", "Konten", "Spiele pro Tag"]) await expect(page.getByText(secret)).toHaveCount(0);
});

test("sign in with a code by email: wrong code refused, right code signs in, sign out again", async ({ page }) => {
  test.skip(!!process.env.BASE_URL, "live sends real mail; only the local e2e server has the fixed code");
  // the real server (no mocks): the e2e server sends no mail and uses the fixed code 123456
  await page.goto("/");
  await openSettings(page);
  await page.getByLabel("E-Mail-Adresse").fill("e2e@example.com");
  await page.getByRole("button", { name: "Code per E-Mail" }).click();
  await expect(page.getByText("Code an e2e@example.com geschickt")).toBeVisible();
  const code = page.getByLabel("Code aus der E-Mail");
  await code.fill("000000");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByText("Der Code stimmt nicht oder ist abgelaufen.")).toBeVisible();
  await code.fill("123456");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByText("e2e@example.com", { exact: true })).toBeVisible(); // signed in as …
  await page.reload(); // the session is a cookie: it survives a reload
  await openSettings(page);
  await expect(page.getByText("e2e@example.com", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page.getByLabel("E-Mail-Adresse")).toBeVisible();
});
