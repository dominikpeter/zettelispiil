import { expect, test, type Browser, type Page } from "@playwright/test";

// each player is a separate browser context = a separate phone with its own localStorage
async function phone(browser: Browser) {
  const ctx = await browser.newContext({ ...test.info().project.use });
  return ctx.newPage();
}

/** drag the Zetteli sideways like a thumb would */
async function swipe(page: Page, dir: "right" | "left") {
  const box = (await page.getByTestId("slip").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dir === "right" ? 1 : -1) * i * 25, y);
  await page.mouse.up();
}

const word = (page: Page) => page.getByTestId("word").innerText();

test("one phone: default players, write, swipe through every round, stats at the end", async ({ page }) => {
  await page.goto("/");
  for (const n of ["Lisa", "Beni", "Tim", "Nora", "Domi"]) await expect(page.getByLabel(/Spieler \d/).and(page.locator(`[value="${n}"]`))).toBeVisible();
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);

  // lobby: 1 Zetteli each, two rounds only
  await expect(page.getByText("Lisa", { exact: true })).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await page.getByRole("button", { name: "Pantomime weglassen" }).click();
  await page.getByRole("button", { name: "Geräusch weglassen" }).click();
  await page.getByRole("button", { name: "Spiel starten" }).click();

  // the phone goes round: everyone writes one Zetteli
  const words = ["Schoggi", "Matterhorn", "Velo", "Raclette", "Zytglogge"];
  for (const w of words) {
    await page.getByRole("button", { name: /^Ich bin / }).click();
    await page.getByLabel("Zetteli 1", { exact: true }).fill(w);
    await page.getByRole("button", { name: "In die Schüssel" }).click();
  }

  // play: swipe or tap until the game ends
  let swipes = 0;
  const end = page.getByText("Gewonnen hat").or(page.getByText("Unentschieden"));
  for (let guard = 0; guard < 40 && !(await end.isVisible()); guard++) {
    const go = page.getByRole("button", { name: "Los, Zetteli ziehen" });
    const next = page.getByRole("button", { name: /^Runde \d starten/ });
    await expect(go.or(next).or(page.getByTestId("word")).or(end).first()).toBeVisible();
    if (await go.isVisible()) await go.click();
    else if (await next.isVisible()) await next.click();
    else if (await page.getByTestId("word").isVisible()) {
      const before = await word(page);
      if (swipes++ % 2) await swipe(page, "right");
      else await page.getByRole("button", { name: "Erraten" }).click();
      await expect(page.getByTestId("word").filter({ hasText: before })).toHaveCount(0);
    }
  }

  await expect(end).toBeVisible();
  for (const h of ["Spielverlauf", "Punkte pro Runde", "Tempo", "Spieler", "Die Zetteli"]) await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
  for (const w of words) await expect(page.getByText(w, { exact: true }).first()).toBeAttached();
});

test("every phone: only the describer sees the Zetteli, one skip with swap back, time up hands over", async ({ browser }) => {
  const host = await phone(browser);
  await host.goto("/");
  await host.getByRole("button", { name: /Jedes Handy/ }).click();
  await host.getByLabel("Dein Name").fill("Lisa");
  await host.getByRole("button", { name: "Raum erstellen" }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{4}$/);
  const code = host.url().split("/").pop()!;
  await expect(host.getByAltText(`QR ${code}`)).toBeVisible();

  const others = await Promise.all(["Nora", "Tim", "Beni"].map(() => phone(browser)));
  for (const [i, n] of ["Nora", "Tim", "Beni"].entries()) {
    await others[i].goto(`/r/${code.toLowerCase()}`); // lowercase link still works
    await others[i].getByLabel("Dein Name").fill(n);
    await others[i].getByRole("button", { name: "Beitreten" }).click();
    await expect(others[i].getByText(`(du)`)).toBeVisible();
  }
  const phones = [host, ...others];

  // 1 Zetteli each, 10 s turns, 1 skip (default)
  await host.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await host.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await host.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  for (let i = 0; i < 4; i++) await host.getByRole("button", { name: "Sekunden pro Zug weniger" }).click();
  await expect(host.getByText("10", { exact: true })).toBeVisible();
  await host.getByRole("button", { name: "Spiel starten" }).click();

  for (const [i, p] of phones.entries()) {
    await p.getByLabel("Zetteli 1", { exact: true }).fill(`Wort${i}`);
    await p.getByRole("button", { name: "In die Schüssel" }).click();
  }

  // exactly one phone may start; only it ever sees a Zetteli
  const go = (p: Page) => p.getByRole("button", { name: "Los, Zetteli ziehen" });
  await expect.poll(async () => (await Promise.all(phones.map((p) => go(p).isVisible()))).filter(Boolean).length, { timeout: 10_000 }).toBe(1);
  const d = phones[(await Promise.all(phones.map((p) => go(p).isVisible()))).indexOf(true)];
  await go(d).click();
  await expect(d.getByTestId("word")).toBeVisible();
  for (const p of phones) if (p !== d) {
    await expect(p.getByText(/^(Ratet!|Zuhören)$/)).toBeVisible();
    await expect(p.getByTestId("word")).toHaveCount(0);
  }

  // skip one: it's set aside, no second skip, swap back and forth
  const first = await word(d);
  await swipe(d, "left");
  await expect(d.getByTestId("word")).not.toHaveText(first);
  const second = await word(d);
  await expect(d.getByRole("button", { name: `Zurück zu ${first}` })).toBeVisible();
  await expect(d.getByRole("button", { name: /^Weiter/ })).toBeDisabled();
  await d.getByRole("button", { name: `Zurück zu ${first}` }).click();
  await expect(d.getByTestId("word")).toHaveText(first);
  await d.getByRole("button", { name: `Zurück zu ${second}` }).click();
  await expect(d.getByTestId("word")).toHaveText(second);

  // guess one by swiping; the others see it count
  await swipe(d, "right");
  for (const p of phones) await expect(p.getByLabel(/ 1, | 1$/)).toBeVisible();

  // time up: locked, then the other team is up
  await expect(d.getByText("Zeit um!")).toBeVisible({ timeout: 15_000 });
  await expect(d.getByRole("button", { name: "Erraten" })).toBeDisabled();
  await expect(host.getByText(/hat 1 Zetteli geholt/)).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => (await Promise.all(phones.map((p) => go(p).isVisible()))).filter(Boolean).length, { timeout: 10_000 }).toBe(1);
  expect(await go(d).isVisible()).toBe(false);
});

test("language and theme live in the settings sheet", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Alle schreiben Begriffe/)).toBeVisible(); // German by default
  await page.getByRole("button", { name: "Einstellungen" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByText(/Everyone writes words/)).toBeVisible();
  await page.getByRole("button", { name: /Dark/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Français" }).click();
  await page.reload();
  await expect(page.getByText(/Chacun écrit des mots/)).toBeVisible(); // remembered
});

test("unknown room code says so and offers the way back", async ({ page }) => {
  await page.goto("/r/QQQQ");
  await expect(page.getByText("Diesen Raum gibt es nicht. Prüf den Code.")).toBeVisible();
  await page.getByRole("button", { name: "Zur Startseite" }).click();
  await expect(page).toHaveURL("/");
});

test("drawing round: lines drawn on one phone show up on the others", async ({ browser }) => {
  const host = await phone(browser);
  await host.goto("/");
  await host.getByRole("button", { name: /Jedes Handy/ }).click();
  await host.getByLabel("Dein Name").fill("Lisa");
  await host.getByRole("button", { name: "Raum erstellen" }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{4}$/);
  const code = host.url().split("/").pop()!;
  const others = await Promise.all([0, 1, 2].map(() => phone(browser)));
  for (const [i, p] of others.entries()) {
    await p.goto(`/r/${code}`);
    await p.getByLabel("Dein Name").fill(`P${i}`);
    await p.getByRole("button", { name: "Beitreten" }).click();
  }
  const phones = [host, ...others];

  // only the drawing round, 1 Zetteli each
  await host.getByRole("button", { name: "Zeichnen hinzufügen" }).click();
  for (const r of ["Umschreiben", "Pantomime", "Ein Wort", "Geräusch"]) await host.getByRole("button", { name: `${r} weglassen` }).click();
  for (let i = 0; i < 3; i++) await host.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await host.getByRole("button", { name: "Spiel starten" }).click();
  for (const [i, p] of phones.entries()) {
    await p.getByLabel("Zetteli 1", { exact: true }).fill(`Bild${i}`);
    await p.getByRole("button", { name: "In die Schüssel" }).click();
  }

  const go = (p: Page) => p.getByRole("button", { name: "Los, Zetteli ziehen" });
  await expect.poll(async () => (await Promise.all(phones.map((p) => go(p).isVisible()))).filter(Boolean).length, { timeout: 10_000 }).toBe(1);
  const d = phones[(await Promise.all(phones.map((p) => go(p).isVisible()))).indexOf(true)];
  const watcher = phones.find((p) => p !== d)!;
  await go(d).click();
  await expect(d.getByTestId("word")).toBeVisible();

  // draw a zig-zag on the paper
  const paper = d.getByRole("img", { name: "Hier zeichnen" });
  const box = (await paper.boundingBox())!;
  await d.mouse.move(box.x + 30, box.y + 30);
  await d.mouse.down();
  for (let i = 1; i <= 10; i++) await d.mouse.move(box.x + 30 + i * 25, box.y + 30 + (i % 2) * 80);
  await d.mouse.up();

  // the watcher's canvas gets ink (dark pixels), and never the word
  const inked = () =>
    watcher.locator("canvas").evaluate((c: HTMLCanvasElement) => {
      const px = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
      return n;
    });
  await expect.poll(inked, { timeout: 5_000 }).toBeGreaterThan(50);
  await expect(watcher.getByTestId("word")).toHaveCount(0);

  // wiping clears it for everyone
  await d.getByRole("button", { name: "Alles löschen" }).click();
  await expect.poll(inked, { timeout: 5_000 }).toBe(0);
});
