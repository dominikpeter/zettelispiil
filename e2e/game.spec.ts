import { expect, test, type Page } from "@playwright/test";
import { closePhonesAfterEach, phone } from "./phones";

// each player is a separate browser context = a separate phone with its own localStorage
closePhonesAfterEach();

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
  for (const n of ["Lisa", "Nora", "Nelly", "Tim"]) await expect(page.getByLabel(/Spieler \d/).and(page.locator(`[value="${n}"]`))).toBeVisible();
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);

  // lobby: 1 Zetteli each, two rounds only
  await expect(page.getByText("Lisa", { exact: true })).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await page.getByRole("button", { name: "Pantomime weglassen" }).click();
  await page.getByRole("button", { name: "Geräusch weglassen" }).click();
  await page.getByRole("button", { name: "Spiel starten" }).click();

  // the phone goes round: everyone writes one Zetteli
  const words = ["Schoggi", "Matterhorn", "Velo", "Raclette"];
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

  // details on tap: a Zetteli round by round, a player's rounds and tempo
  await page.getByText("Alle 4 Zetteli").click();
  await page.locator("summary").filter({ hasText: "Schoggi" }).last().click();
  await expect(page.locator("details[open]").filter({ hasText: "Schoggi" }).last().getByText(/erklärt von/)).toHaveCount(2); // guessed in both rounds
  await page.getByLabel(/^Lisa: \d+ Zetteli$/).click();
  await expect(page.locator("details[open]").filter({ has: page.getByLabel(/^Lisa: /) }).getByText(/× übersprungen/)).toBeVisible();
});

for (const teams of [3, 4]) {
  test(`${teams} teams on one small phone: host sets the count, new players fill the empty teams, play to the end, stats for every team`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 }); // iPhone SE
    const sideways = () => page.evaluate("(() => { const y = scrollY; scrollTo(80, y); const x = scrollX; scrollTo(0, y); return x; })()");
    const fitsTall = (where: string) => expect.poll(() => page.evaluate("document.scrollingElement.scrollHeight - innerHeight"), { message: `${where} scrolls`, timeout: 3000 }).toBeLessThanOrEqual(1);
    await page.goto("/");
    await page.getByRole("button", { name: "Neues Spiel" }).click();
    await page.waitForURL(/\/local$/);
    await expect(page.getByText("Lisa", { exact: true })).toBeVisible();
    for (let i = 2; i < teams; i++) await page.getByRole("button", { name: "Teams mehr" }).click();
    await expect(page.getByRole("button", { name: "Teams mehr" })).toBeEnabled({ enabled: teams < 4 });
    await expect(page.getByRole("button", { name: "Jedes Team braucht 2 Leute" })).toBeDisabled(); // the new teams are still empty
    const extra = ["Mia", "Jan", "Eva", "Luc"].slice(0, (teams - 2) * 2);
    for (const n of extra) {
      await page.getByLabel("Spieler hinzufügen").fill(n);
      await page.getByRole("button", { name: "+", exact: true }).click();
      await expect(page.getByText(n, { exact: true })).toBeVisible();
    }
    expect(await sideways()).toBe(0);
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
    for (const r of ["Pantomime", "Geräusch"]) await page.getByRole("button", { name: `${r} weglassen` }).click();
    await page.getByRole("button", { name: "Spiel starten" }).click();

    for (let i = 0; i < 4 + extra.length; i++) {
      await page.getByRole("button", { name: /^Ich bin / }).click();
      await page.getByLabel("Zetteli 1", { exact: true }).fill(`Wort${i}`);
      await page.getByRole("button", { name: "In die Schüssel" }).click();
    }

    const end = page.getByText("Gewonnen hat").or(page.getByText("Unentschieden"));
    for (let guard = 0; guard < 60 && !(await end.isVisible()); guard++) {
      const go = page.getByRole("button", { name: "Los, Zetteli ziehen" });
      const next = page.getByRole("button", { name: /^Runde \d starten/ });
      await expect(go.or(next).or(page.getByTestId("word")).or(end).first()).toBeVisible();
      if (await go.isVisible()) (await fitsTall("ready"), await go.click());
      else if (await next.isVisible()) (await fitsTall("round end"), expect(await sideways()).toBe(0), await next.click());
      else if (await page.getByTestId("word").isVisible()) {
        const before = await word(page);
        await page.getByRole("button", { name: "Erraten" }).click();
        await expect(page.getByTestId("word").filter({ hasText: before })).toHaveCount(0);
      }
    }

    await expect(end).toBeVisible();
    await expect(page.getByTestId("totals").locator(":scope > span")).toHaveCount(teams); // one score per team
    expect(await sideways()).toBe(0);
  });
}

test("every phone: only the describer sees the Zetteli, one skip with swap back, time up hands over", async ({ browser }) => {
  const host = await phone(browser);
  await host.goto("/");
  await host.getByRole("button", { name: /Mehrere Handys/ }).click();
  await expect(host.getByLabel("Dein Name")).toHaveValue(""); // no name pre-filled: you type yours (or tap the sparkle)
  await host.getByLabel("Dein Name").fill("Lisa");
  await host.getByRole("button", { name: "Raum erstellen" }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{5}$/);
  const code = host.url().split("/").pop()!;
  await expect(host.getByAltText(`QR ${code}`)).toBeVisible();
  // WhatsApp invite: opens the chat picker with the room code and its link ready to send
  const wa = new URL((await host.getByRole("link", { name: "Per WhatsApp einladen" }).getAttribute("href"))!);
  expect(wa.hostname).toBe("wa.me");
  expect(wa.searchParams.get("text")).toContain(`Zettelispiil-Raum ${code}`);
  expect(wa.searchParams.get("text")).toContain(`/r/${code}`);

  const others = await Promise.all(["Nora", "Tim", "Beni"].map(() => phone(browser)));
  await host.goto("/"); // next time: still empty, nothing remembered from before
  await host.getByRole("button", { name: /Mehrere Handys/ }).click();
  await expect(host.getByLabel("Dein Name")).toHaveValue("");
  await host.goto(`/r/${code}`);
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

test("heckle: the other team disturbs the describer twice, then the button is used up", async ({ browser }) => {
  const host = await phone(browser);
  await host.goto("/");
  await host.getByRole("button", { name: /Mehrere Handys/ }).click();
  await host.getByLabel("Dein Name").fill("Lisa");
  await host.getByRole("button", { name: "Raum erstellen" }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{5}$/);
  const code = host.url().split("/").pop()!;
  const names = ["Lisa", "Nora", "Tim", "Beni"]; // teams alternate on join: Lisa+Tim, Nora+Beni
  const others = await Promise.all([0, 1, 2].map(() => phone(browser)));
  for (const [i, n] of names.slice(1).entries()) {
    await others[i].goto(`/r/${code}`);
    await others[i].getByLabel("Dein Name").fill(n);
    await others[i].getByRole("button", { name: "Beitreten" }).click();
    await expect(others[i].getByText(`(du)`)).toBeVisible();
  }
  const phones = [host, ...others];

  // host turns heckling on (2 per player and turn is the default); the others see it in the summary
  await expect(host.getByRole("button", { name: "Stören pro Person und Zug mehr" })).toHaveCount(0);
  await host.getByRole("switch", { name: /Störmodus/ }).check();
  await expect(others[0].getByText("Störmodus: Stör-Bonus fürs Team, das zurückliegt")).toBeVisible(); // auto by default
  await expect(host.getByRole("button", { name: "Stören pro Person und Zug mehr" })).toHaveCount(0);
  await host.getByRole("button", { name: "Fix", exact: true }).click(); // a fixed number per player instead
  await expect(host.getByRole("button", { name: "Stören pro Person und Zug mehr" })).toBeVisible();
  await expect(others[0].getByText("Störmodus: 2× pro Person und Zug")).toBeVisible();
  for (let i = 0; i < 3; i++) await host.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await host.getByRole("button", { name: "Spiel starten" }).click();
  for (const [i, p] of phones.entries()) {
    await p.getByLabel("Zetteli 1", { exact: true }).fill(`Wort${i}`);
    await p.getByRole("button", { name: "In die Schüssel" }).click();
  }

  const go = (p: Page) => p.getByRole("button", { name: "Los, Zetteli ziehen" });
  await expect.poll(async () => (await Promise.all(phones.map((p) => go(p).isVisible()))).filter(Boolean).length, { timeout: 10_000 }).toBe(1);
  const di = (await Promise.all(phones.map((p) => go(p).isVisible()))).indexOf(true);
  const d = phones[di];
  const foe = phones[(di + 1) % 4];
  const mate = phones[(di + 2) % 4];
  await go(d).click();
  await expect(d.getByTestId("word")).toBeVisible();

  const heckle = (p: Page) => p.getByRole("button", { name: /^Stören/ });
  await expect(heckle(mate)).toHaveCount(0); // the describer's own team can't
  await expect(heckle(d)).toHaveCount(0);
  await expect(heckle(foe)).toContainText("noch 2×");
  const foe2 = phones[(di + 3) % 4];
  await heckle(foe).click();
  await expect(d.getByTestId("heckled")).toHaveText(`${names[(di + 1) % 4]} stört!`);
  // only the Zetteli is disturbed, the buttons stay put
  await expect(d.locator("[data-heckled]")).toHaveCount(1);
  await expect(d.locator("[data-heckled]").getByTestId("word")).toBeVisible();
  await expect(d.locator("[data-heckled] button")).toHaveCount(0);
  await expect(foe.getByTestId("heckled")).toHaveCount(0); // only the describer's phone
  // one at a time: while it runs (3 s of a 30 s turn), nobody can heckle
  await expect(heckle(foe)).toContainText("noch 1×");
  await expect(heckle(foe)).toBeDisabled();
  await expect(heckle(foe2)).toBeDisabled();
  await expect(d.getByTestId("heckled")).toHaveCount(0, { timeout: 6_000 }); // over
  await expect(heckle(foe)).toBeEnabled();
  await heckle(foe).click();
  await expect(d.locator("[data-heckled]")).toHaveCount(1);
  // the Zetteli still works while disturbed
  await swipe(d, "right");
  for (const p of phones) await expect(p.getByLabel(/ 1, | 1$/)).toBeVisible();
  await expect(d.getByTestId("heckled")).toHaveCount(0, { timeout: 6_000 });
  await expect(heckle(foe)).toContainText("noch 0×");
  await expect(heckle(foe)).toBeDisabled(); // no third time
  await expect(heckle(foe2)).toBeEnabled(); // the teammate still has theirs
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
  await host.getByRole("button", { name: /Mehrere Handys/ }).click();
  await host.getByLabel("Dein Name").fill("Lisa");
  await host.getByRole("button", { name: "Raum erstellen" }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{5}$/);
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

  // after a pause the drawer still sees their drawing
  const ink = (p: Page) =>
    p.locator("canvas").evaluate((c: HTMLCanvasElement) => {
      const px = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
      return n;
    });
  await d.getByRole("button", { name: "Pause" }).click();
  await d.getByRole("button", { name: "Weiterspielen" }).click();
  await expect.poll(() => ink(d), { timeout: 5_000 }).toBeGreaterThan(50);

  // wiping clears it for everyone, and lines drawn right after the wipe still arrive
  await d.getByRole("button", { name: "Alles löschen" }).click();
  await expect.poll(inked, { timeout: 5_000 }).toBe(0);
  const b2 = (await paper.boundingBox())!;
  await d.mouse.move(b2.x + 40, b2.y + 150);
  await d.mouse.down();
  for (let i = 1; i <= 8; i++) await d.mouse.move(b2.x + 40 + i * 20, b2.y + 150 + (i % 2) * 40);
  await d.mouse.up();
  await expect.poll(inked, { timeout: 5_000 }).toBeGreaterThan(50);
});

/** one-phone game with 1 Zetteli each, written by `write(i)`, up to the first "Los" */
async function localGame(page: Page, write = (i: number) => `Wort${i}`) {
  page.on("dialog", (d) => d.accept()); // confirm() for leaving / cancelling
  await page.goto("/");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await page.getByRole("button", { name: "Spiel starten" }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: /^Ich bin / }).click();
    await page.getByLabel("Zetteli 1", { exact: true }).fill(write(i));
    await page.getByRole("button", { name: "In die Schüssel" }).click();
  }
}

test("pause hides the Zetteli and stops the clock; cancel goes back to the lobby; back goes home", async ({ page }) => {
  await localGame(page);
  await page.getByRole("button", { name: "Los, Zetteli ziehen" }).click();
  await expect(page.getByTestId("word")).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("dialog", { name: "Pause" })).toBeVisible();
  await expect(page.getByTestId("word")).toHaveCount(0); // no peeking
  const frozen = await page.getByRole("timer").getAttribute("aria-label");
  await page.waitForTimeout(2500);
  expect(await page.getByRole("timer").getAttribute("aria-label")).toBe(frozen);
  await page.getByRole("button", { name: "Weiterspielen" }).click();
  await expect(page.getByTestId("word")).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Spiel abbrechen" }).click();
  await expect(page.getByRole("button", { name: "Spiel starten" })).toBeVisible(); // lobby, same players
  await expect(page.getByText("Tim", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Zurück" }).click();
  await expect(page).toHaveURL("/");
});

test("the same word on two phones is cancelled for both, who each write a new one", async ({ browser }) => {
  const host = await phone(browser);
  await host.goto("/");
  await host.getByRole("button", { name: /Mehrere Handys/ }).click();
  await host.getByLabel("Dein Name").fill("Lisa");
  await host.getByRole("button", { name: "Raum erstellen" }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{5}$/);
  const code = host.url().split("/").pop()!;
  const others = await Promise.all([0, 1, 2].map(() => phone(browser)));
  for (const [i, p] of others.entries()) {
    await p.goto(`/r/${code}`);
    await p.getByLabel("Dein Name").fill(`P${i}`);
    await p.getByRole("button", { name: "Beitreten" }).click();
    await expect(p.getByText("(du)")).toBeVisible();
  }
  for (let i = 0; i < 3; i++) await host.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await host.getByRole("button", { name: "Spiel starten" }).click();

  const [a, b, c, d] = [host, ...others];
  await a.getByLabel("Zetteli 1", { exact: true }).fill("Velo");
  await a.getByRole("button", { name: "In die Schüssel" }).click();
  await expect(a.getByText("Deine Zetteli sind drin")).toBeVisible();
  await b.getByLabel("Zetteli 1", { exact: true }).fill("vélo");
  await b.getByRole("button", { name: "In die Schüssel" }).click();
  for (const p of [a, b]) await expect(p.getByRole("alert").filter({ hasText: /hat noch jemand geschrieben/ })).toBeVisible();

  await a.getByLabel("Zetteli 1", { exact: true }).fill("Aare");
  await a.getByRole("button", { name: "In die Schüssel" }).click();
  await b.getByLabel("Zetteli 1", { exact: true }).fill("Rösti");
  await b.getByRole("button", { name: "In die Schüssel" }).click();
  await c.getByLabel("Zetteli 1", { exact: true }).fill("Fondue");
  await c.getByRole("button", { name: "In die Schüssel" }).click();
  await d.getByLabel("Zetteli 1", { exact: true }).fill("Gipfeli");
  await d.getByRole("button", { name: "In die Schüssel" }).click();
  await expect(a.getByText(/Runde 1 von 4/)).toBeVisible();
});

const noSignIn = (page: Page) => page.route("**/api/ai/status", (r) => r.fulfill({ json: { ai: true, login: false, providers: [], user: null } }));

test("AI help: spelling suggestion, hint filled in and shown to the describer (AI answer mocked)", async ({ page }) => {
  await noSignIn(page);
  await page.route("**/api/ai/check", async (route) => {
    const { words } = route.request().postDataJSON() as { words: string[] };
    const fix: Record<string, string> = { Matterhon: "Matterhorn" };
    await route.fulfill({ json: { ai: true, results: words.map((w) => ({ word: w, corrected: fix[w] ?? w, tooHard: w === "Quark", reason: "", hint: `Tipp zu ${fix[w] ?? w}` })) } });
  });
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await page.getByRole("button", { name: "Spiel starten" }).click();

  await page.getByRole("button", { name: /^Ich bin / }).click();
  await page.getByLabel("Zetteli 1", { exact: true }).fill("Matterhon");
  await page.getByRole("button", { name: /Meintest du „Matterhorn“/ }).click();
  await expect(page.getByLabel("Zetteli 1", { exact: true })).toHaveValue("Matterhorn");
  await expect(page.getByLabel(/Zetteli 1: Hinweis/)).toHaveValue(/Tipp zu Matter/);
  await page.getByRole("button", { name: "In die Schüssel" }).click();
  for (let i = 1; i < 4; i++) {
    await page.getByRole("button", { name: /^Ich bin / }).click();
    await page.getByLabel("Zetteli 1", { exact: true }).fill(`Wort${i}`);
    await expect(page.getByLabel(/Zetteli 1: Hinweis/)).toHaveValue(`Tipp zu Wort${i}`);
    await page.getByRole("button", { name: "In die Schüssel" }).click();
  }
  await page.getByRole("button", { name: "Los, Zetteli ziehen" }).click();
  const w = await page.getByTestId("word").innerText();
  await expect(page.getByText(`Tipp zu ${w}`)).toBeVisible(); // hint under the word
});

test("AI ideas: a topic gives three words, tapping one fills the next empty Zetteli (AI answer mocked)", async ({ page }) => {
  await noSignIn(page);
  await page.route("**/api/ai/check", (r) => r.fulfill({ json: { ai: false } }));
  await page.route("**/api/ai/ideas", async (route) => {
    expect(route.request().postDataJSON().topic).toBe("Schweizer Essen");
    await route.fulfill({ json: { ai: true, words: ["Käsefondue", "Rösti", "Birchermüesli"] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Zetteli pro Person weniger" }).click(); // 2 each
  await page.getByRole("button", { name: "Spiel starten" }).click();
  await page.getByRole("button", { name: /^Ich bin / }).click();
  await page.getByLabel(/^Thema/).fill("Schweizer Essen");
  await page.getByRole("button", { name: "Vorschläge holen" }).click();
  await page.getByRole("button", { name: "„Rösti“ übernehmen" }).click();
  await expect(page.getByLabel("Zetteli 1", { exact: true })).toHaveValue("Rösti");
  await page.getByRole("button", { name: "„Birchermüesli“ übernehmen" }).click();
  await expect(page.getByLabel("Zetteli 2", { exact: true })).toHaveValue("Birchermüesli");
  await expect(page.getByRole("button", { name: "„Rösti“ übernehmen" })).toHaveCount(0); // used ideas disappear
});

test("one phone can play the drawing round on a flip chart", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  await page.getByRole("button", { name: "Zeichnen hinzufügen" }).click();
  for (const r of ["Umschreiben", "Pantomime", "Ein Wort", "Geräusch"]) await page.getByRole("button", { name: `${r} weglassen` }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await page.getByRole("button", { name: "Spiel starten" }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: /^Ich bin / }).click();
    await page.getByLabel("Zetteli 1", { exact: true }).fill(`Bild${i}`);
    await page.getByRole("button", { name: "In die Schüssel" }).click();
  }
  await expect(page.getByText(/Flipchart oder Papier/)).toBeVisible();
  await page.getByRole("button", { name: "Los, Zetteli ziehen" }).click();
  await expect(page.getByTestId("word")).toBeVisible(); // the word to draw, no drawing pad on one phone
  await expect(page.getByRole("img", { name: "Hier zeichnen" })).toHaveCount(0);
  await page.getByRole("button", { name: "Erraten" }).click();
  await expect(page.getByTestId("word")).toBeVisible();
});

test("rounds can be dragged into a new order", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  const rows = page.locator("[data-round]");
  await rows.last().scrollIntoViewIfNeeded();
  const from = (await page.getByRole("button", { name: "Geräusch verschieben" }).boundingBox())!;
  const to = (await rows.first().boundingBox())!;
  await page.mouse.move(from.x + 10, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + 10, from.y + from.height / 2 + ((to.y + 4 - from.y - from.height / 2) * i) / 10);
  await page.mouse.up();
  await expect(rows).toHaveText([/Geräusch/, /Umschreiben/, /Pantomime/, /Ein Wort/]);
  await page.reload(); // the new order is saved
  await expect(rows).toHaveText([/Geräusch/, /Umschreiben/, /Pantomime/, /Ein Wort/]);

  // a finger: long-press the handle, then move (real touch events through Chrome DevTools)
  await rows.last().scrollIntoViewIfNeeded();
  const cdp = await page.context().newCDPSession(page);
  const a = (await rows.last().getByRole("button", { name: /verschieben$/ }).boundingBox())!;
  const b = (await rows.first().boundingBox())!;
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", y?: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: y === undefined ? [] : [{ x: a.x + 10, y }] });
  const y0 = a.y + a.height / 2;
  await touch("touchStart", y0);
  await page.waitForTimeout(400);
  for (let i = 1; i <= 10; i++) await touch("touchMove", y0 + ((b.y + 4 - y0) * i) / 10);
  await touch("touchEnd");
  await expect(rows).toHaveText([/Ein Wort/, /Geräusch/, /Umschreiben/, /Pantomime/]);

  // a keyboard: focus the handle, Space picks it up, arrows move it, Space drops it
  await page.getByRole("button", { name: "Pantomime verschieben" }).focus();
  await page.keyboard.press("Space");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");
  await expect(rows).toHaveText([/Pantomime/, /Ein Wort/, /Geräusch/, /Umschreiben/]);
});

test("game language: the host picks English for the Zetteli while the app stays German", async ({ page }) => {
  await noSignIn(page);
  const langs: string[] = [];
  await page.route("**/api/ai/check", async (route) => {
    const { words, lang } = route.request().postDataJSON() as { words: string[]; lang: string };
    langs.push(lang);
    await route.fulfill({ json: { ai: true, results: words.map((w) => ({ word: w, corrected: w, tooHard: false, reason: "", hint: "" })) } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("button", { name: "Spiel starten" }).click();
  await page.getByRole("button", { name: /^Ich bin / }).click();
  await page.getByLabel("Zetteli 1", { exact: true }).fill("Cheese");
  await expect.poll(() => langs.at(-1)).toBe("en");
  await expect(page.getByRole("button", { name: "In die Schüssel" })).toBeVisible(); // UI still German
});

test("heckle auto: over several turns the team that falls behind gets a bonus; its mates see who used it; the stats tell", async ({ browser }) => {
  test.skip(!!process.env.BASE_URL, "needs the test server's loaded dice (E2E_HECKLE_DICE=always)");
  test.setTimeout(120_000);
  const host = await phone(browser);
  await host.goto("/");
  await host.getByRole("button", { name: /Mehrere Handys/ }).click();
  await host.getByLabel("Dein Name").fill("Lisa");
  await host.getByRole("button", { name: "Raum erstellen" }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{5}$/);
  const code = host.url().split("/").pop()!;
  const names = ["Lisa", "Nora", "Tim", "Beni"]; // teams alternate on join: Lisa+Tim, Nora+Beni
  const others = await Promise.all([0, 1, 2].map(() => phone(browser)));
  for (const [i, n] of names.slice(1).entries()) {
    await others[i].goto(`/r/${code}`);
    await others[i].getByLabel("Dein Name").fill(n);
    await others[i].getByRole("button", { name: "Beitreten" }).click();
    await expect(others[i].getByText("(du)")).toBeVisible();
  }
  const phones = [host, ...others];
  await host.getByRole("switch", { name: /Störmodus/ }).check(); // auto is the default
  for (let i = 0; i < 2; i++) await host.getByRole("button", { name: "Zetteli pro Person weniger" }).click(); // 2 each: 8 in the bowl
  for (let i = 0; i < 4; i++) await host.getByRole("button", { name: "Sekunden pro Zug weniger" }).click(); // 10 s turns
  for (const r of ["Pantomime", "Ein Wort", "Geräusch"]) await host.getByRole("button", { name: `${r} weglassen` }).click();
  await host.getByRole("button", { name: "Spiel starten" }).click();
  for (const [i, p] of phones.entries()) {
    for (const z of [1, 2]) await p.getByLabel(`Zetteli ${z}`, { exact: true }).fill(`Wort${i}${z}`);
    await p.getByRole("button", { name: "In die Schüssel" }).click();
  }

  const go = (p: Page) => p.getByRole("button", { name: "Los, Zetteli ziehen" });
  const bonus = (p: Page) => p.getByRole("button", { name: /^Stör-Bonus!/ });
  const describer = async () => {
    await expect.poll(async () => (await Promise.all(phones.map((p) => go(p).isVisible()))).filter(Boolean).length, { timeout: 20_000 }).toBe(1);
    return (await Promise.all(phones.map((p) => go(p).isVisible()))).indexOf(true);
  };
  const guess = async (d: Page, n: number) => {
    for (let i = 0; i < n; i++) {
      const w = await d.getByTestId("word").innerText();
      await d.getByRole("button", { name: "Erraten" }).click();
      await expect(d.getByTestId("word").filter({ hasText: w })).toHaveCount(0);
    }
  };

  // turn 1: team A guesses one, then time runs out. Nobody was behind at the start: no bonus anywhere
  const a = await describer();
  await go(phones[a]).click();
  await expect(phones[a].getByTestId("word")).toBeVisible();
  for (const p of phones) await expect(bonus(p)).toHaveCount(0);
  await guess(phones[a], 1);

  // turn 2: team B describes (it's behind, but describing), guesses nothing: team A leads, so no bonus either
  const b = await describer();
  expect(b % 2).not.toBe(a % 2);
  await go(phones[b]).click();
  await expect(phones[b].getByTestId("word")).toBeVisible();
  for (const p of phones) await expect(bonus(p)).toHaveCount(0);

  // turn 3: team A again; team B is 1 behind and gets the bonus (the test server's dice always say yes)
  const a2 = await describer();
  expect(a2 % 2).toBe(a % 2);
  await go(phones[a2]).click();
  const [b1, b2] = phones.filter((_, i) => i % 2 !== a % 2);
  await expect(bonus(b1)).toBeVisible();
  await expect(bonus(b2)).toContainText("noch 1×"); // one bonus for the whole team
  await expect(bonus(phones[(a2 + 2) % 4])).toHaveCount(0); // the describer's mate: nothing
  await bonus(b1).click();
  const hecklerName = names[phones.indexOf(b1)];
  await expect(phones[a2].getByTestId("heckled")).toHaveText(`${hecklerName} stört!`); // the describer is disturbed
  await expect(b2.getByTestId("heckled-mate")).toHaveText(`${hecklerName} hat gestört`); // the teammate sees who used it
  await expect(bonus(b2)).toBeDisabled(); // the team's bonus is spent
  await guess(phones[a2], 7); // empty the bowl: the game ends (one round)

  // the end stats mention it
  await expect(host.getByText(/Gewonnen hat|Unentschieden/)).toBeVisible({ timeout: 20_000 });
  await expect(host.getByRole("heading", { name: "Stören" })).toBeVisible();
  await expect(host.getByText(/1× Stör-Bonus/)).toBeVisible();
  await expect(host.getByText("1× gestört")).toBeVisible();
});
