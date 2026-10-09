import { devices, expect, test, type Page } from "@playwright/test";
import { closePhonesAfterEach, phone as openPhone } from "./phones";

// drawing: the full-size paper keeps the word and the Erraten button on screen, also when the next Zetteli comes
test.use({ browserName: "webkit" });
closePhonesAfterEach();
const SHOTS = process.env.SHOTS; // a folder: keep screenshots of each step

test("full-size drawing keeps word and Erraten, upright and sideways, through the next Zetteli", async ({ browser }) => {
  test.setTimeout(180_000);
  const phone = () => openPhone(browser, { ...devices["iPhone 15"] });
  const host = await phone();
  await host.goto("/");
  await host.getByRole("button", { name: /Mehrere Handys/ }).click();
  await host.getByLabel("Dein Name").fill("Lisa");
  await host.getByRole("button", { name: "Raum erstellen" }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{6}$/);
  const code = host.url().split("/").pop()!;
  const others = await Promise.all([0, 1, 2].map(() => phone()));
  for (const [i, p] of others.entries()) {
    await p.goto(`/r/${code}`);
    await p.getByLabel("Dein Name").fill(`P${i}`);
    await p.getByRole("button", { name: "Beitreten" }).click();
    await expect(p.getByText("(du)")).toBeVisible();
  }
  const phones = [host, ...others];
  for (const r of ["Umschreiben", "Pantomime", "Ein Wort", "Geräusch"]) await host.getByRole("button", { name: `${r} weglassen` }).click();
  await host.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await host.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await host.getByRole("button", { name: "Spiel starten" }).click();
  for (const [i, p] of phones.entries()) {
    await p.getByLabel("Zetteli 1", { exact: true }).fill(`Wort${i}`);
    await p.getByLabel("Zetteli 2", { exact: true }).fill(`Zweites${i}`);
    await p.getByRole("button", { name: "In die Schüssel" }).click();
  }
  const go = (p: Page) => p.getByRole("button", { name: "Los, Zetteli ziehen" });
  await expect.poll(async () => (await Promise.all(phones.map((p) => go(p).isVisible()))).filter(Boolean).length, { timeout: 10_000 }).toBe(1);
  const d = phones[(await Promise.all(phones.map((p) => go(p).isVisible()))).indexOf(true)];
  await go(d).click();
  await expect(d.getByRole("img", { name: "Hier zeichnen" })).toBeVisible();

  const shot = (n: string) => SHOTS && d.screenshot({ path: `${SHOTS}/${n}.png` });
  const intact = async (label: string, strict = true) => {
    await expect(d.getByTestId("word"), label).toBeVisible();
    await expect(d.getByRole("button", { name: "Erraten" }), label).toBeVisible();
    const measure = () =>
      d.evaluate(() => {
        const r = (e: Element) => e.getBoundingClientRect();
        const btns = [...document.querySelectorAll("button")].filter((b) => b.offsetParent && b.closest(".fixed")).map(r); // every button of the full-size screen
        const c = r(document.querySelector("canvas")!);
        return { paper: c.width * c.height, ok: btns.length > 5 && btns.every((b) => b.bottom <= innerHeight + 0.5 && b.right <= innerWidth + 0.5 && b.top >= -0.5 && b.left >= -0.5) && document.scrollingElement!.scrollHeight <= innerHeight + 1 };
      });
    // the new slip unfolds for a moment: wait for the layout to settle
    if (SHOTS) await d.screenshot({ path: `${SHOTS}/try-${label.replace(/\W+/g, "-")}.png` });
    if (strict) await expect.poll(async () => (await measure()).ok, { message: label }).toBe(true);
    if (SHOTS) await d.waitForTimeout(700);
    const m = await measure();
    return m.paper; // its area in px
  };

  const small = await intact("normal", false); // the ordinary view is the layout spec's business
  await shot("1-normal");
  await d.getByRole("button", { name: "Grosse Zeichenfläche" }).click();
  const big = await intact("full upright");
  expect(big).toBeGreaterThan(small);
  await shot("2-full-upright");

  await d.getByRole("button", { name: "Erraten" }).click(); // the next picture comes
  await expect(d.getByRole("button", { name: "Zurück zur normalen Ansicht" })).toBeVisible(); // still full
  await intact("full, next Zetteli");
  await shot("3-full-next-card");

  // rotation lock on: turn the view in the app. The paper then runs sideways, and a stroke must still land where the finger is
  await d.getByRole("button", { name: "Ansicht drehen" }).click();
  expect(await intact("turned")).toBeGreaterThan(big); // sideways the paper goes wide: more room than upright
  await shot("3b-full-turned");
  const spot = await d.evaluate(() => {
    const r = document.querySelector("canvas")!.getBoundingClientRect();
    return { r: { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height } };
  });
  // a point 25 % along the paper's own x and y axes; the paper's x runs down the screen, its y runs left
  const sx = spot.r.right - 0.25 * spot.r.width, sy = spot.r.top + 0.25 * spot.r.height;
  await d.mouse.move(sx, sy);
  await d.mouse.down();
  await d.mouse.move(sx + 1, sy + 14, { steps: 5 });
  await d.mouse.up();
  const hit = () => d.evaluate(() => {
    const c = document.querySelector("canvas")!;
    const ctx = c.getContext("2d")!;
    const at = (u: number, v: number) => ctx.getImageData(Math.round(u * c.width) - 4, Math.round(v * c.height) - 4, 8, 8).data.some((x, i) => i % 4 === 3 && x > 0);
    return { onPoint: at(0.25, 0.25), notMirrored: !at(0.75, 0.75) };
  });
  await expect.poll(hit).toEqual({ onPoint: true, notMirrored: true });
  await shot("3c-full-turned-drawn");
  await d.getByRole("button", { name: "Erraten" }).click();
  await intact("turned, next Zetteli");
  await shot("3d-full-turned-next");
  await d.getByRole("button", { name: "Ansicht drehen" }).click(); // and back

  await d.setViewportSize({ width: 844, height: 390 }); // turned sideways
  await expect.poll(() => intact("full sideways")).toBeGreaterThan(500 * 340);
  const paper = () => d.evaluate(() => document.querySelector("canvas")!.getBoundingClientRect().toJSON() as DOMRect);
  const p = await paper();
  expect(p.width / p.height).toBeCloseTo(1.5, 1); // wide, and as tall as the screen allows
  expect(p.height).toBeGreaterThan(390 - 30);
  await shot("4-full-sideways");

  // a line at the far right of the wide paper: the others' paper turns wide too and shows it there, undistorted
  await d.mouse.move(p.left + 0.9 * p.width, p.top + 0.5 * p.height);
  await d.mouse.down();
  await d.mouse.move(p.left + 0.9 * p.width + 2, p.top + 0.5 * p.height + 14, { steps: 5 });
  await d.mouse.up();
  const w = phones.find((x) => x !== d)!;
  const seen = () =>
    w.evaluate(() => {
      const c = document.querySelector("canvas")!;
      const at = (u: number, v: number) => c.getContext("2d")!.getImageData(Math.round(u * c.width) - 4, Math.round(v * c.height) - 4, 8, 8).data.some((x, i) => i % 4 === 3 && x > 0);
      return { wide: Math.round((c.width / c.height) * 10) / 10, there: at(0.9, 0.5), notLeft: !at(0.6, 0.5) };
    });
  await expect.poll(seen, { timeout: 10_000 }).toEqual({ wide: 1.5, there: true, notLeft: true });
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/4b-watcher-wide.png` });
  await d.getByRole("button", { name: "Erraten" }).click();
  await intact("full sideways, next Zetteli");
  await shot("5-full-sideways-next");

  await d.getByRole("button", { name: "Zurück zur normalen Ansicht" }).click();
  await expect(d.getByRole("button", { name: "Grosse Zeichenfläche" })).toBeVisible();
});
