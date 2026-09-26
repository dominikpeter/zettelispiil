import { expect, test, type Page } from "@playwright/test";

// A real payment on Stripe's own test pages (no money), started by `just stripe-e2e`, which also checks the webhooks.
// Stripe's published test card 4242 4242 4242 4242; TWINT has its own test page to authorize.
const card = process.env.STRIPE_CARD_URL;
const twint = process.env.STRIPE_TWINT_URL;
test.skip(!card || !twint, "run through `just stripe-e2e`");
test.setTimeout(120_000);

async function backWithThanks(page: Page) {
  await page.waitForURL(/\/\?coffee=thanks$/, { timeout: 60_000 });
  await expect(page.getByText("Merci für den Kaffee!")).toBeVisible();
}

test("card: pay CHF 5 on Stripe's page, back in the app with a thank-you", async ({ page }) => {
  await page.goto(card!);
  await page.getByLabel("Email").fill("coffee-e2e@example.com");
  const method = page.getByRole("radio", { name: /card/i });
  if (await method.isVisible().catch(() => false)) await method.check();
  await page.getByPlaceholder("1234 1234 1234 1234").fill("4242424242424242");
  await page.getByPlaceholder("MM / YY").fill("12 / 34");
  await page.getByPlaceholder("CVC").fill("123");
  await page.getByLabel(/cardholder name|name on card/i).fill("Coffee Test");
  const country = page.getByLabel(/country/i);
  if (await country.isVisible().catch(() => false)) await country.selectOption("CH");
  await page.getByTestId("hosted-payment-submit-button").click();
  await backWithThanks(page);
});

test("TWINT: pay CHF 1 via TWINT's test page, back in the app with a thank-you", async ({ page }) => {
  await page.goto(twint!);
  await page.getByLabel("Email").fill("coffee-e2e@example.com");
  await page.getByRole("radio", { name: /twint/i }).check();
  await page.getByTestId("hosted-payment-submit-button").click();
  await page.getByRole("link", { name: /authorize test payment/i }).or(page.getByRole("button", { name: /authorize test payment/i })).click({ timeout: 30_000 });
  await backWithThanks(page);
});
