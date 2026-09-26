import { expect, test } from "@playwright/test";
import Stripe from "stripe";
import { closePhonesAfterEach } from "./phones";

// "buy me a coffee": the local e2e build shows the button (E2E_COFFEE) but has no Stripe key, so Stripe's page is mocked here;
// the server's own checks (amount, signature) run for real.
test.skip(!!process.env.BASE_URL, "live has real Stripe keys: no checkout sessions from tests");
closePhonesAfterEach();

const openSettings = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Einstellungen", exact: true }).first().click();

test("coffee sizes and a custom amount go to Stripe; back from paying, a thank-you", async ({ page }) => {
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
  for (const chf of [0, -1, 1.5, 501, "5; drop", null]) expect((await request.post("/api/coffee", { data: { chf } })).status(), String(chf)).toBe(400);
  expect((await request.post("/api/coffee", { data: { chf: 5 } })).status()).toBe(503); // a good amount, but no Stripe key on the test server

  const payload = JSON.stringify({ id: "evt_e2e", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_e2e", object: "checkout.session", payment_status: "paid", amount_total: 500 } } });
  const hook = (signature: string) => request.post("/api/coffee/webhook", { data: payload, headers: { "stripe-signature": signature, "content-type": "application/json" } });
  expect((await hook("t=1,v1=forged")).status()).toBe(400);
  const signed = new Stripe("sk_unused").webhooks.generateTestHeaderString({ payload, secret: "whsec_e2e_only" });
  expect((await hook(signed)).status()).toBe(200);
});
