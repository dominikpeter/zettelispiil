import { expect, test, type Locator, type Page } from "@playwright/test";
import { closePhonesAfterEach, phone } from "./phones";

closePhonesAfterEach();

/** painted pixels on a canvas */
const inked = (c: Locator) =>
  c.evaluate((c: HTMLCanvasElement) => {
    const px = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
    return n;
  });

test("drawing replay: the end stats show what was drawn, by whom, and trace it in again", async ({ browser }) => {
  test.setTimeout(120_000); // four phones
  const host = await phone(browser);
  await host.goto("/");
  await host.getByRole("button", { name: /Mehrere Handys/ }).click();
  await host.getByLabel("Dein Name").fill("Lisa");
  await host.getByRole("button", { name: "Raum erstellen" }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{6}$/);
  const code = host.url().split("/").pop()!;
  const others: Page[] = [];
  for (const i of [0, 1, 2]) {
    const p = await phone(browser);
    await p.goto(`/r/${code}`);
    await p.getByLabel("Dein Name").fill(`P${i}`);
    await p.getByRole("button", { name: "Beitreten" }).click();
    await expect(p.getByText("(du)")).toBeVisible();
    others.push(p);
  }
  const phones = [host, ...others];
  const names = ["Lisa", "P0", "P1", "P2"];
  // drawing is already on by default with several phones; drop everything else to leave only it
  for (const r of ["Umschreiben", "Pantomime", "Ein Wort", "Geräusch"]) await host.getByRole("button", { name: `${r} weglassen` }).click();
  for (let i = 0; i < 3; i++) await host.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await host.getByRole("button", { name: "Spiel starten" }).click();
  for (const [i, p] of phones.entries()) {
    await p.getByLabel("Zetteli 1", { exact: true }).fill(["Velo", "Matterhorn", "Schoggi", "Raclette"][i]);
    await p.getByRole("button", { name: "In die Schüssel" }).click();
  }

  const go = (p: Page) => p.getByRole("button", { name: "Los, Zetteli ziehen" });
  await expect.poll(async () => (await Promise.all(phones.map((p) => go(p).isVisible()))).filter(Boolean).length, { timeout: 10_000 }).toBe(1);
  const di = (await Promise.all(phones.map((p) => go(p).isVisible()))).indexOf(true);
  const d = phones[di];
  await go(d).click();
  const pad = d.getByRole("img", { name: "Hier zeichnen" });
  await expect(pad).toBeVisible();
  const word = await d.getByTestId("word").innerText();

  // one line on the first Zetteli; once a watcher has it, the server has it
  const box = (await pad.boundingBox())!;
  await d.mouse.move(box.x + 20, box.y + 20);
  await d.mouse.down();
  for (let i = 1; i <= 8; i++) await d.mouse.move(box.x + 20 + i * 20, box.y + 20 + (i % 2) * 60);
  await d.mouse.up();
  const watcher = phones.find((p) => p !== d)!;
  await expect.poll(() => inked(watcher.locator("canvas")), { timeout: 10_000 }).toBeGreaterThan(30);

  // guess it, then the rest without drawing (blank ones aren't kept) until the game ends
  const end = host.getByText("Gewonnen hat").or(host.getByText("Unentschieden"));
  for (let guard = 0; guard < 60 && !(await end.isVisible()); guard++) {
    for (const p of phones) {
      if (await go(p).isVisible()) await go(p).click().catch(() => {});
      else if (await p.getByTestId("word").isVisible()) await p.getByRole("button", { name: "Erraten" }).click().catch(() => {});
    }
    await host.waitForTimeout(300);
  }
  await expect(end).toBeVisible();

  // another phone than the drawer's: the drawing, its word and who drew it
  const viewer = phones.find((p) => p !== d)!;
  await viewer.bringToFront();
  const thumb = viewer.getByRole("button").filter({ hasText: word }).filter({ hasText: `gezeichnet von ${names[di]}` });
  await thumb.scrollIntoViewIfNeeded();
  await expect(thumb).toBeVisible();
  await expect(thumb).toContainText(/erraten in \d+[.,]\d s/);
  await expect(viewer.getByRole("button").filter({ hasText: "gezeichnet von" })).toHaveCount(1); // the others were never drawn on
  await expect.poll(() => inked(thumb.locator("canvas")), { timeout: 10_000 }).toBeGreaterThan(30);

  await thumb.click();
  const big = viewer.getByRole("dialog", { name: `Zeichnung: ${word}` });
  await expect(big).toBeVisible();
  await expect.poll(() => inked(big.getByRole("img")), { timeout: 10_000 }).toBeGreaterThan(30);
  await big.getByRole("button", { name: "Nochmal abspielen" }).click();
  await expect.poll(() => inked(big.getByRole("img")), { timeout: 10_000 }).toBeGreaterThan(30);
  await big.getByRole("button", { name: "Schliessen" }).click();
  await expect(big).toBeHidden();
});
