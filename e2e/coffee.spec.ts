import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import Stripe from "stripe";
import { closePhonesAfterEach } from "./phones";

// "buy me a coffee". Locally the build shows the button (E2E_COFFEE) but has no Stripe key, so Stripe's page is mocked;
// the server's own checks (amount, signature) run for real. Against the live site (BASE_URL) the last two tests go all the way
// to Stripe's real payment page, without paying.
const live = !!process.env.BASE_URL;
closePhonesAfterEach();

const openSettings = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Einstellungen", exact: true }).first().click();

test("coffee sizes and a custom amount go to Stripe; back from paying, a thank-you", async ({ page }) => {
  test.skip(live, "mocks Stripe");
  const asked: { chf: number; back: string; lang: string }[] = [];
  await page.route("**/api/coffee", async (r) => {
    asked.push(r.request().postDataJSON());
    await r.fulfill({ json: { url: "/?coffee=thanks" } }); // stands in for Stripe's page, which sends the player back like this
  });
  await page.goto("/");
  await openSettings(page);
  await expect(page.getByRole("heading", { name: "Spendier mir einen Kaffee" })).toBeVisible();
  for (const [name, chf] of [["Kleiner Kaffee", 1], ["Grosser Kaffee", 5], ["Deluxe-Kaffee", 10]] as const)
    await expect(page.getByRole("button", { name: `${name}, CHF ${chf}` })).toBeVisible();

  await page.getByRole("button", { name: "Grosser Kaffee, CHF 5" }).click();
  await expect(page.getByText("Merci für den Kaffee!")).toBeVisible();
  expect(asked[0]).toEqual({ chf: 5, back: "/", lang: "de" });
  await page.getByText("Merci für den Kaffee!").click(); // tapped away, and the marker leaves the address
  await expect(page.getByText("Merci für den Kaffee!")).toHaveCount(0);
  expect(page.url()).not.toContain("coffee=");

  await openSettings(page);
  const own = page.getByLabel("Eigener Betrag in CHF");
  await own.fill("abc12x");
  await expect(own).toHaveValue("12"); // digits only
  await page.getByRole("button", { name: "Spendieren" }).click();
  await expect(page.getByText("Merci für den Kaffee!")).toBeVisible();
  expect(asked[1].chf).toBe(12);
});

test("the server checks the amount and Stripe's signature itself", async ({ request }) => {
  test.skip(live, "needs the test server's webhook secret");
  for (const chf of [0, -1, 1.5, 501, "5; drop", null]) expect((await request.post("/api/coffee", { data: { chf } })).status(), String(chf)).toBe(400);
  expect((await request.post("/api/coffee", { data: { chf: 5 } })).status()).toBe(503); // a good amount, but no Stripe key on the test server

  const payload = JSON.stringify({ id: "evt_e2e", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_e2e", object: "checkout.session", payment_status: "paid", amount_total: 500 } } });
  const hook = (signature: string) => request.post("/api/coffee/webhook", { data: payload, headers: { "stripe-signature": signature, "content-type": "application/json" } });
  expect((await hook("t=1,v1=forged")).status()).toBe(400);
  const signed = new Stripe("sk_unused").webhooks.generateTestHeaderString({ payload, secret: "whsec_e2e_only" });
  expect((await hook(signed)).status()).toBe(200);
});

test("live: a coffee opens Stripe's real payment page in CHF, card on, no Klarna or Amazon Pay", async ({ page }) => {
  test.skip(!live, "only against the live site");
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("button", { name: "Kleiner Kaffee, CHF 1" }).click();
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 20_000 });
  await expect(page.getByText("Ein Kaffee für Zettelispiil")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/1[.,]00/).first()).toBeVisible();
  await expect(page.getByText("Karte", { exact: true }).first()).toBeVisible(); // card; Apple Pay and Google Pay depend on the device
  await expect(page.getByText("Klarna")).toHaveCount(0);
  await expect(page.getByText("Amazon Pay")).toHaveCount(0);
  // not paid: the session simply expires
});

test("live: the webhook takes only events signed with our secret", async ({ request }) => {
  test.skip(!live, "only against the live site");
  const secret = existsSync(".env.local") ? /^STRIPE_WEBHOOK_SECRET='?([^'\n]+)/m.exec(readFileSync(".env.local", "utf8"))?.[1] : undefined;
  test.skip(!secret, "the webhook secret is not on this computer");
  // an unpaid session: accepted, but not counted as a coffee
  const payload = JSON.stringify({ id: "evt_e2e_live", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_e2e_live", object: "checkout.session", payment_status: "unpaid", amount_total: 100 } } });
  const hook = (signature: string) => request.post("/api/coffee/webhook", { data: payload, headers: { "stripe-signature": signature, "content-type": "application/json" } });
  expect((await hook("t=1,v1=forged")).status()).toBe(400);
  expect((await hook(new Stripe("sk_unused").webhooks.generateTestHeaderString({ payload, secret: secret! }))).status()).toBe(200);
});
