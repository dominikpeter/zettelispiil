import { expect, test } from "@playwright/test";
import { closePhonesAfterEach } from "./phones";

closePhonesAfterEach();

test("back from Stripe without paying (back button): another coffee can be bought", async ({ page }) => {
  test.skip(!!process.env.BASE_URL, "mocks Stripe");
  let asked = 0;
  await page.route("**/api/coffee", (r) => (asked++, r.fulfill({ json: { url: "/stripe-stand-in" } })));
  await page.route("**/stripe-stand-in", (r) => r.fulfill({ status: 204 })); // 204: the browser stays on the page as it was left, buttons busy
  await page.goto("/");
  await page.getByRole("button", { name: "Einstellungen", exact: true }).first().click();
  await page.getByRole("button", { name: "Kleiner Kaffee, CHF 1" }).click();
  await expect.poll(() => asked).toBe(1);
  // Safari and Chrome keep the left page in their back-forward cache; coming back shows it again with this event
  // (Playwright's browsers don't keep that cache, so it's played here)
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  const big = page.getByRole("button", { name: "Grosser Kaffee, CHF 5" });
  await expect(big).toBeEnabled();
  await big.click();
  await expect.poll(() => asked).toBe(2);
});
