import { devices, expect, test, type Page } from "@playwright/test";
import { closePhonesAfterEach, phone } from "./phones";

// "Zettelispiil as an app": phones that haven't installed it get a banner on the home page.
closePhonesAfterEach();

// the banner waits until this phone has been in a game: a first visit is for finding out how to play
const played = (page: Page) => page.addInitScript(() => localStorage.setItem("zettelispiil:played", "1"));

const TITLE = "Zettelispiil auf den Home-Bildschirm";
const bannerOf = (page: Page) => page.getByRole("complementary", { name: TITLE });

test("Android: the browser's install prompt behind our button; after a choice the banner is gone", async ({ browser }) => {
  const page = await phone(browser, { ...devices["Pixel 7"] });
  await played(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Zettelispiil" })).toBeVisible();
  await expect(bannerOf(page)).toHaveCount(0); // no prompt from the browser yet: nothing to offer
  // Chrome fires this once the app can be installed; stand in for it, and for the system dialog it opens
  const offer = () =>
    page.evaluate(() => {
      const e = new Event("beforeinstallprompt") as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      (window as unknown as { prompted: number }).prompted = 0;
      e.prompt = async () => void (window as unknown as { prompted: number }).prompted++;
      e.userChoice = Promise.resolve({ outcome: "dismissed" }); // even a "no" in the system dialog is a choice
      dispatchEvent(e);
    });
  await offer();
  const banner = bannerOf(page);
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("button", { name: "Später" })).toBeVisible();
  await banner.getByRole("button", { name: "Installieren" }).click();
  expect(await page.evaluate(() => (window as unknown as { prompted: number }).prompted)).toBe(1);
  await expect(banner).toHaveCount(0);
  // asked once per phone: the browser offering again later doesn't bring it back
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zettelispiil" })).toBeVisible();
  await offer();
  await expect(bannerOf(page)).toHaveCount(0);
});

test("iPhone: the two taps to add it by hand; «Später» keeps it away, also after a reload", async ({ browser }) => {
  const page = await phone(browser, { ...devices["iPhone SE"] }); // the narrowest phone: the banner must fit 320px
  await played(page);
  await page.goto("/");
  const banner = bannerOf(page);
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("listitem")).toHaveText(["Tippe auf «Teilen»", "Dann «Zum Home-Bildschirm»"]);
  await expect(banner.getByRole("button", { name: "Installieren" })).toHaveCount(0); // iPhones have no install prompt
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = await banner.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await banner.getByRole("button", { name: "Später" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zettelispiil" })).toBeVisible();
  await expect(bannerOf(page)).toHaveCount(0);
});

test("computer: no banner (mouse, not a phone)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Zettelispiil" })).toBeVisible();
  await expect(bannerOf(page)).toHaveCount(0);
});

test("first visit: no banner even on a phone that could install, so the mode choice is on the first screen", async ({ browser }) => {
  const page = await phone(browser, { ...devices["iPhone SE"] });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Zettelispiil" })).toBeVisible();
  await expect(bannerOf(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Mehrere Handys/ })).toBeInViewport();
});
