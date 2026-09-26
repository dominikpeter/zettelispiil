import { expect, test, type Page } from "@playwright/test";

// the settings sheet: colour palettes (Post-it is the default, Klassisch the old loud look) and sharing the app

const LEMON = "#fffcd6"; // the plain paper every slip has when no palette paints it
const RAINBOW = ["#bdef6b", "#f3f566", "#ffc04d", "#ff9d78", "#ff77aa", "#7cc3ec"]; // the Post-it palette's sticky notes

const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(), name);
/** the paper colour of every slip on the home page's hero pile */
const slipColors = (page: Page) =>
  page
    .locator(".slip")
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).getPropertyValue("--color-paper").trim().toLowerCase()))
    .then((cs) => cs.map((c) => c.replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, "#$1$1$2$2$3$3"))); // the browser may shorten #ff77aa to #f7a

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Einstellungen" }).click();
  return page.getByRole("dialog");
}

test("fresh phone: Post-it is the default, a neutral app with every Zetteli a different sticky note", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Zettelispiil" })).toBeVisible();
  const sheet = await openSettings(page);
  await expect(sheet.getByRole("button", { name: "Post-it" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("button", { name: "Klassisch" })).toHaveAttribute("aria-pressed", "false");
  expect(await cssVar(page, "--l-canvas")).toBe("#fafaf8"); // neutral chrome, not the old cream desk
  expect(await cssVar(page, "--l-accent")).toBe("#d81b6a");
  // the colour lives on the slips: the hero pile shows several different sticky notes, none of them plain lemon
  const colors = await slipColors(page);
  expect(colors.length).toBeGreaterThan(0);
  expect(colors, "no hero slip should fall back to plain lemon paper in the default palette").not.toContain(LEMON);
  expect(colors.every((c) => RAINBOW.includes(c)), `hero slips: ${colors.join(", ")}`).toBe(true);
  expect(new Set(colors).size).toBeGreaterThanOrEqual(3);
});

test("Klassisch brings back the old loud yellow/pink/blue look, and it sticks after a reload", async ({ page }) => {
  await page.goto("/");
  const sheet = await openSettings(page);
  await sheet.getByRole("button", { name: "Klassisch" }).click();
  await expect(sheet.getByRole("button", { name: "Klassisch" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("button", { name: "Post-it" })).toHaveAttribute("aria-pressed", "false");
  const classic = async () => {
    expect(await cssVar(page, "--l-canvas")).toBe("#f5f1e8"); // the old default's cream desk
    expect(await cssVar(page, "--l-cta")).toBe("#ffe14d"); // sticky-note yellow buttons
    expect(await cssVar(page, "--l-accent")).toBe("#d6336c");
    expect(new Set(await slipColors(page))).toEqual(new Set([LEMON])); // no rainbow: all slips plain paper
  };
  await classic();
  expect(await page.evaluate(() => localStorage.getItem("palette"))).toBe("classic");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Zettelispiil" })).toBeVisible();
  await classic();
});

test('a phone that saved the old "neon" palette keeps its look: migrated to Post-it, not a broken fallback', async ({ page }) => {
  // "neon" was a real, shipped palette id; set it before any of the app's code runs, as a returning phone would have it
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("palette", "neon");
      sessionStorage.setItem("seeded", "1");
    }
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Zettelispiil" })).toBeVisible();
  // first paint already uses the renamed id (the inline script in layout.tsx), and the saved value is rewritten
  expect(await page.evaluate(() => document.documentElement.dataset.palette)).toBe("postit");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("palette"))).toBe("postit");
  expect(await cssVar(page, "--l-canvas")).toBe("#fafaf8");
  const colors = await slipColors(page);
  expect(colors.every((c) => RAINBOW.includes(c)), `hero slips: ${colors.join(", ")}`).toBe(true);
  const sheet = await openSettings(page);
  await expect(sheet.getByRole("button", { name: "Post-it" })).toHaveAttribute("aria-pressed", "true");
  // and it survives a reload (now from the migrated value)
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.palette)).toBe("postit");
  expect(await cssVar(page, "--l-canvas")).toBe("#fafaf8");
});

test("share the app: WhatsApp and «Link kopieren» side by side; copying puts the site on the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const sheet = await openSettings(page);
  const whatsapp = sheet.getByRole("link", { name: "Per WhatsApp teilen" });
  const copy = sheet.getByRole("button", { name: "Link kopieren" });
  await expect(whatsapp).toBeVisible();
  await expect(copy).toBeVisible();
  expect(await whatsapp.getAttribute("href")).toContain("wa.me");
  expect(decodeURIComponent((await whatsapp.getAttribute("href"))!)).toContain("https://zettelispiil.ch");
  // side by side: same row (measured together, since the sheet slides in)
  const copyEl = await copy.elementHandle();
  const row = () =>
    whatsapp.evaluate((a, b) => {
      const [w, c] = [a.getBoundingClientRect(), b!.getBoundingClientRect()];
      return Math.abs(w.top - c.top) < 2 && w.right <= c.left + 1;
    }, copyEl);
  await expect.poll(row).toBe(true);

  await copy.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://zettelispiil.ch");
  const done = sheet.getByRole("button", { name: "Link kopiert" });
  await expect(done).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Link kopieren" })).toHaveCount(0);
  // a brief confirmation, then back to the plain button
  await expect(sheet.getByRole("button", { name: "Link kopieren" })).toBeVisible({ timeout: 4_000 });
  await expect(page).toHaveURL(/\/$/); // never left the app
});
