import { expect, test, type Page } from "@playwright/test";

// A real payment on Stripe's own test pages (no money), started by `just stripe-e2e`, which also checks the webhooks.
// Stripe's published test card 4242 4242 4242 4242; TWINT has its own test page to authorize.
// With several payment methods on, Stripe shows them as an accordion: each method has its own "Pay with …" button.
const card = process.env.STRIPE_CARD_URL;
const twint = process.env.STRIPE_TWINT_URL;
test.skip(!card || !twint, "run through `just stripe-e2e`");
test.setTimeout(120_000);

async function email(page: Page) {
  const field = page.getByLabel("Email");
  if (await field.isVisible().catch(() => false)) await field.fill("coffee-e2e@example.com");
}

/** pick a payment method: the row's radio (its accessible name is the visible label, "Card"/"TWINT"). The row's own
 *  "Pay with …" trigger stays invisible until hover/focus, so a real tap lands on the radio itself — force does the same. */
const method = (page: Page, name: "Card" | "TWINT") => page.getByRole("radio", { name, exact: true }).check({ force: true });
const submit = (page: Page) => page.getByTestId("hosted-payment-submit-button").or(page.getByRole("button", { name: /^(Donate|Pay)$/ })).first().click();

async function backWithThanks(page: Page) {
  await page.waitForURL(/\/\?coffee=thanks$/, { timeout: 60_000 });
  await expect(page.getByText("Merci für den Kaffee!")).toBeVisible();
}

test("card: pay CHF 5 on Stripe's page, back in the app with a thank-you", async ({ page }) => {
  await page.goto(card!);
  await method(page, "Card"); // opens the card form
  await page.getByPlaceholder(/1234 1234 1234 1234/).fill("4242424242424242");
  await page.getByPlaceholder(/MM \/ YY/).fill("12 / 34");
  await page.getByPlaceholder(/CVC/).fill("123");
  const name = page.getByLabel(/cardholder name|name on card/i);
  if (await name.isVisible().catch(() => false)) await name.fill("Coffee Test");
  const country = page.getByLabel(/country or region|country/i);
  if (await country.isVisible().catch(() => false)) await country.selectOption("CH").catch(() => {});
  await email(page); // fill last: selecting a method can remount the shared email field above it
  await submit(page);
  await backWithThanks(page);
});

test("TWINT: pay CHF 1 via TWINT's test page, back in the app with a thank-you", async ({ page }) => {
  await page.goto(twint!);
  await method(page, "TWINT");
  await email(page); // fill last: selecting a method can remount the shared email field above it
  await submit(page);
  // TWINT in test mode opens a page to authorize (or fail) the test payment
  await page.getByRole("link", { name: /authorize test payment/i }).or(page.getByRole("button", { name: /authorize test payment/i })).first().click({ timeout: 45_000 });
  await backWithThanks(page);
});
