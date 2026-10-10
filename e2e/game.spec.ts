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

// feedback: a renamed player ("Beni auf Kufen", an AI name from an earlier game) kept coming back. The list lived in page
// state only, and the page kept an old copy for the whole visit
test("home: a renamed player stays renamed, after a reload and back from a game", async ({ page }) => {
  await page.goto("/");
  const first = () => page.getByLabel("Spieler 1", { exact: true });
  await first().fill("Beni");
  await page.reload();
  await expect(first()).toHaveValue("Beni");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  await page.goBack(); // back inside the app: no older copy of the list
  await expect(first()).toHaveValue("Beni");
  await first().fill("Nina");
  await page.goto("/"); // and a fresh load of the page
  await expect(first()).toHaveValue("Nina");
});

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
    if (await go.isVisible()) {
      await go.click();
      await expect(page.getByTestId("word")).toBeVisible();
    } else if (await next.isVisible()) {
      await next.click();
      await expect(go).toBeVisible();
    }
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

  await expect(page.getByRole("heading", { name: "Auszeichnungen" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Meiste Zetteli erklärt/ })).toBeVisible();

  // drill down: a Zetteli's story round by round, on to the player who described it, and back
  const story = page.getByRole("dialog");
  await page.getByText("Alle 4 Zetteli").click();
  await page.getByRole("button", { name: /Schoggi/ }).last().click();
  await expect(story).toHaveAccessibleName("Schoggi");
  await expect(story.getByRole("heading", { name: "Runde für Runde" })).toBeVisible();
  await expect(story.getByText("Sekunden total")).toBeVisible();
  await expect(story.getByText(/erklärt von/)).toHaveCount(2); // guessed in both rounds
  const describer = story.getByText(/erklärt von/).first().getByRole("button");
  const who = await describer.innerText();
  await describer.click();
  await expect(story).toHaveAccessibleName(who);
  await expect(story.getByRole("heading", { name: "Erklärte Zetteli" })).toBeVisible();
  await expect(story.getByRole("button", { name: /Schoggi/ }).first()).toBeVisible(); // they got it guessed, and it links back
  await story.getByRole("button", { name: "Zurück" }).click();
  await expect(story).toHaveAccessibleName("Schoggi");
  await page.keyboard.press("Escape");
  await expect(story).toBeHidden();

  // a player's story: tiles, rounds, and the Zetteli they wrote
  await page.getByLabel(/^Lisa: \d+ Zetteli$/).click();
  await expect(story).toHaveAccessibleName("Lisa");
  await expect(story.getByText("gepasst", { exact: true })).toBeVisible();
  await expect(story.getByRole("heading", { name: "Selbst geschrieben" })).toBeVisible();
  await story.getByRole("button", { name: "Schliessen" }).click();
  await expect(story).toBeHidden();

  // the same in English and French
  for (const [lang, awards, explained, close] of [
    ["English", "Awards", "Slips explained", "Close"],
    ["Français", "Distinctions", "Papiers expliqués", "Fermer"],
  ]) {
    await page.getByRole("button", { name: /^(Einstellungen|Settings|Réglages)$/ }).first().click();
    await page.getByRole("button", { name: lang }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: awards })).toBeVisible();
    await page.getByLabel(/^Lisa: /).click();
    await expect(story.getByRole("heading", { name: explained })).toBeVisible();
    await story.getByRole("button", { name: close }).click();
  }
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
      await page.getByRole("textbox", { name: "Spieler hinzufügen" }).fill(n);
      await page.getByRole("button", { name: "Spieler hinzufügen" }).click();
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
      if (await go.isVisible()) {
        await fitsTall("ready");
        await go.click();
        await expect(page.getByTestId("word")).toBeVisible();
      } else if (await next.isVisible()) {
        await fitsTall("round end");
        expect(await sideways()).toBe(0);
        await next.click();
        await expect(go).toBeVisible();
      } else if (await page.getByTestId("word").isVisible()) {
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

test("one phone: back to the settings while writing and before the first turn keeps every Zetteli written", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await page.getByRole("button", { name: "Spiel starten" }).click();
  for (const [who, w] of [["Lisa", "Schoggi"], ["Nora", "Matterhorn"]]) {
    await page.getByRole("button", { name: `Ich bin ${who}` }).click();
    await page.getByLabel("Zetteli 1", { exact: true }).fill(w);
    await page.getByRole("button", { name: "In die Schüssel" }).click();
  }
  await expect(page.getByRole("button", { name: "Ich bin Nelly" })).toBeVisible(); // Nora's Zetteli has landed in the bowl

  // the back arrow goes one step back, to the settings, without asking: nothing is lost
  await page.getByRole("button", { name: "Zurück zu den Einstellungen" }).click();
  await expect(page.getByText("2 Zetteli sind schon geschrieben, sie bleiben im Spiel.")).toBeVisible();
  await page.getByRole("button", { name: "Pantomime weglassen" }).click(); // what one came back for
  await page.getByRole("button", { name: "Spiel starten" }).click();
  // Lisa and Nora are done: the phone goes to Nelly and Tim only
  for (const [who, w] of [["Nelly", "Velo"], ["Tim", "Raclette"]]) {
    await page.getByRole("button", { name: `Ich bin ${who}` }).click();
    await page.getByLabel("Zetteli 1", { exact: true }).fill(w);
    await page.getByRole("button", { name: "In die Schüssel" }).click();
  }
  await expect(page.getByRole("button", { name: "Los, Zetteli ziehen" })).toBeVisible();

  // all written, no turn yet: the pause menu offers the settings too, and coming back the bowl is full at once
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("dialog", { name: "Pause" }).getByRole("button", { name: /Zurück zu den Einstellungen/ }).click();
  await expect(page.getByText("4 Zetteli sind schon geschrieben, sie bleiben im Spiel.")).toBeVisible();
  await page.getByRole("button", { name: "Spiel starten" }).click();
  await expect(page.getByRole("button", { name: "Los, Zetteli ziehen" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Ich bin / })).toHaveCount(0); // nobody writes again
});

test("every phone: only the describer sees the Zetteli, one skip with swap back, time up hands over", async ({ browser }) => {
  const host = await phone(browser);
  await host.goto("/");
  await host.getByRole("button", { name: /Mehrere Handys/ }).click();
  await expect(host.getByLabel("Dein Name")).toHaveValue(""); // no name pre-filled: you type yours (or tap the sparkle)
  await host.getByLabel("Dein Name").fill("Lisa");
  await host.getByRole("button", { name: "Raum erstellen" }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{6}$/);
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
  await expect(d.getByRole("button", { name: /^Passen/ })).toBeDisabled();
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
  await host.waitForURL(/\/r\/[A-Z0-9]{6}$/);
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
  for (let k = 0; k < 7; k++) await host.getByRole("button", { name: "Sekunden pro Stören weniger" }).click(); // 10 s by default; 3 s fits two in a 30 s turn
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

test("the tour: from the home page, eleven chapters, each step lands on its own, and back to play", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "So geht's: kurze Tour" }).click();
  await expect(page).toHaveURL("/anleitung");
  await expect(page.getByRole("heading", { name: "So geht's" })).toBeVisible();
  const current = page.locator("[aria-current=step]");
  await expect(current).toHaveAttribute("aria-label", "Alle zusammen");
  // every dot jumps to its own chapter, not a neighbour; the scene follows
  const dots = page.getByRole("navigation", { name: "So geht's" }).getByRole("button");
  await expect(dots).toHaveCount(11);
  for (const name of await dots.evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")))) {
    await page.getByRole("button", { name: name!, exact: true }).click();
    await expect(current).toHaveAttribute("aria-label", name!);
  }
  await page.getByRole("button", { name: "Passen" }).click();
  await expect(current).toHaveAttribute("aria-label", "Passen");
  await expect(page.locator("[class*=guide-swipe]")).toHaveCount(1); // exactly one slip in play, none left over
  await page.getByRole("button", { name: "Gewinnen" }).click();
  await expect(current).toHaveAttribute("aria-label", "Gewinnen");
  await expect(page.locator("[class*=guide-swipe]")).toHaveCount(0);
  await page.getByRole("link", { name: "Los geht's" }).click();
  await expect(page).toHaveURL("/");
});

test("an address that leads nowhere: our own page, in the game's language, with the way home", async ({ page }) => {
  const r = await page.goto("/gibt-es-nicht");
  expect(r?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Diese Seite gibt es nicht." })).toBeVisible();
  await page.getByRole("link", { name: "Zur Startseite" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: "Neues Spiel" })).toBeVisible();
});

test("closing the QR scanner only closes it: the join form around it is not sent", async ({ page }) => {
  let joins = 0;
  await page.route("**/api/rooms/**", (r) => (joins++, r.continue()));
  await page.goto("/");
  await page.getByRole("button", { name: /Mehrere Handys/ }).click();
  await page.getByLabel("Dein Name").fill("Lisa");
  await page.getByRole("button", { name: /^Raum beitreten/ }).click();
  await page.getByLabel("Raumcode").fill("ABCD23"); // name and code: a submit would join right away
  await page.getByRole("button", { name: "QR-Code scannen" }).click();
  const scanner = page.getByRole("dialog", { name: "QR-Code scannen" });
  await expect(scanner).toBeVisible();
  await scanner.getByRole("button", { name: "Schliessen" }).click();
  await expect(scanner).toBeHidden();
  await page.waitForTimeout(1000);
  expect(joins).toBe(0); // no join request went out
  await expect(page).toHaveURL("/");
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
  await host.waitForURL(/\/r\/[A-Z0-9]{6}$/);
  const code = host.url().split("/").pop()!;
  const others = await Promise.all([0, 1, 2].map(() => phone(browser)));
  for (const [i, p] of others.entries()) {
    await p.goto(`/r/${code}`);
    await p.getByLabel("Dein Name").fill(`P${i}`);
    await p.getByRole("button", { name: "Beitreten" }).click();
  }
  const phones = [host, ...others];

  // only the drawing round, 1 Zetteli each; drawing is already on by default with several phones
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
  // Resuming immediately must also work while the pause request is still in flight.
  let releasePause!: () => void;
  const pauseGate = new Promise<void>((resolve) => { releasePause = resolve; });
  let pauseRequested!: () => void;
  const requested = new Promise<void>((resolve) => { pauseRequested = resolve; });
  await d.route(`**/api/rooms/${code}`, async (route) => {
    if (route.request().method() === "POST" && route.request().postDataJSON()?.type === "pause") {
      pauseRequested();
      await pauseGate;
    }
    await route.continue();
  });
  await d.getByRole("button", { name: "Pause" }).click();
  await requested;
  await d.getByRole("button", { name: "Weiterspielen" }).click();
  const pauseResponse = d.waitForResponse((response) => response.request().method() === "POST" && response.request().postDataJSON()?.type === "pause");
  releasePause();
  await pauseResponse;
  await expect.poll(async () => (await (await d.request.get(`/api/rooms/${code}`)).json()).pausedLeft).toBe(0);
  await expect(d.getByRole("dialog", { name: "Pause" })).toHaveCount(0);
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

  // Drawing uses the same set-aside slips as the other rounds: swapping them back costs no skip.
  const original = await word(d);
  await d.getByRole("button", { name: /^Passen/ }).click();
  await expect(d.getByTestId("word")).not.toHaveText(original);
  const replacement = await word(d);
  await d.getByRole("button", { name: `Zurück zu ${original}`, exact: true }).click();
  await expect(d.getByTestId("word")).toHaveText(original);
  await expect(d.getByRole("button", { name: /^Passen/ })).toBeDisabled();
  await d.getByRole("button", { name: `Zurück zu ${replacement}`, exact: true }).click();
  await expect(d.getByTestId("word")).toHaveText(replacement);
});

/** one-phone game with 1 Zetteli each, written by `write(i)`, up to the first "Los" */
async function localGame(page: Page, write = (i: number) => `Wort${i}`) {
  page.on("dialog", (d) => expect.soft(`${d.type()}: ${d.message()}`, "a native browser dialog: in-app browsers never show it, the button would do nothing").toBe(""));
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

test("one phone: every absent describer can be skipped", async ({ page }) => {
  await localGame(page);
  const skip = page.getByRole("button", { name: /ist nicht da, überspringen/ });
  // Advance through more than a full player cycle: non-host identities must also send this as the host.
  for (let i = 0; i < 5; i++) {
    await expect(skip).toBeVisible();
    const before = await skip.innerText();
    await skip.click();
    await expect(skip).not.toHaveText(before);
  }
});

test("AI help can be toggled during a turn without losing the game", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { ai: true, login: false, providers: [], user: null } }));
  await page.route("**/api/ai/check", (route) => route.fulfill({ json: { ai: false } }));
  await localGame(page);
  await page.getByRole("button", { name: "Los, Zetteli ziehen" }).click();
  const before = await word(page);
  for (const choice of ["Aus", "An"]) {
    await page.getByRole("button", { name: "Pause" }).click();
    const menu = page.getByRole("dialog", { name: "Pause" });
    await menu.locator("summary").first().click(); // the settings; the host tools have a summary too
    const section = menu.locator("section").filter({ has: page.getByRole("heading", { name: "KI-Hilfe", exact: true }) });
    await section.getByRole("button", { name: choice, exact: true }).click();
    await menu.getByRole("button", { name: "Weiterspielen" }).click();
    await expect(page.getByTestId("word")).toHaveText(before);
  }
  await page.getByRole("button", { name: "Erraten" }).click();
  await expect(page.getByTestId("word")).not.toHaveText(before);
  expect(errors).toEqual([]);
});

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
  await page.getByRole("alertdialog").getByRole("button", { name: "Spiel abbrechen" }).click(); // asked in the app
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
  await host.waitForURL(/\/r\/[A-Z0-9]{6}$/);
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
  await expect(a.getByText(/Runde 1 von 5/)).toBeVisible(); // 5 with several phones: drawing is on by default there
});

const noSignIn = (page: Page) => page.route("**/api/ai/status", (r) => r.fulfill({ json: { ai: true, login: false, providers: [], user: null } }));

test("AI help: spelling suggestion, hint filled in and shown to the describer (AI answer mocked)", async ({ page }) => {
  await noSignIn(page);
  await page.route("**/api/ai/check", async (route) => {
    const { words } = route.request().postDataJSON() as { words: string[] };
    const fix: Record<string, string> = { Matterhon: "Matterhorn" };
    await route.fulfill({ json: { ai: true, results: words.map((w) => ({ word: w, corrected: fix[w] ?? w, tooHard: w === "Quark", reason: "", hint: `Tipp zu ${fix[w] ?? w}` })) } });
  });
  page.on("dialog", (d) => expect.soft(`${d.type()}: ${d.message()}`, "a native browser dialog: in-app browsers never show it, the button would do nothing").toBe(""));
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
  await host.waitForURL(/\/r\/[A-Z0-9]{6}$/);
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
  for (const r of ["Pantomime", "Ein Wort", "Geräusch", "Zeichnen"]) await host.getByRole("button", { name: `${r} weglassen` }).click(); // one round: drawing is on by default with several phones too
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

// feedback: "Zurück" and "Spiel abbrechen" did nothing. They asked with the browser's confirm(), which in-app browsers
// (a link from WhatsApp), the phone apps and previews answer "no" without showing it. Every way out of a game, in every
// phase, is pressed here and must do what it says; a native dialog fails the test (see localGame)
test("pause menu and confirmations are real dialogs: Escape means \"no\" / \"resume\", the page behind can't be reached", async ({ page }) => {
  await localGame(page);
  await page.getByRole("button", { name: "Los, Zetteli ziehen" }).click();
  await expect(page.getByTestId("word")).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  const menu = page.getByRole("dialog", { name: "Pause" });
  await expect(menu).toBeVisible();
  await expect(menu).toBeFocused(); // the dialog itself: no button starts with a focus ring
  // the game behind is out of reach: a tap where "Erraten" is lands in the menu
  const box = (await page.getByRole("button", { name: "Erraten" }).boundingBox())!;
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest("dialog[open]"), [box.x + box.width / 2, box.y + box.height / 2])).toBe(true);
  // cancelling asks; Escape there is "no", and the menu is still open
  await menu.getByRole("button", { name: "Spiel abbrechen" }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ask).toHaveCount(0);
  await expect(menu).toBeVisible();
  // Escape in the menu: back to the turn
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId("word")).toBeVisible();
});

test("every phase: back and each pause-menu button work (asked in the app, never a browser dialog)", async ({ page }) => {
  test.setTimeout(120_000);
  const ask = page.getByRole("alertdialog");
  const home = async () => {
    await expect(page).toHaveURL("/");
    await page.getByRole("button", { name: "Weiterspielen" }).click(); // the game is still there
    await page.waitForURL(/\/local$/);
    // The URL changes before the stored room is read; wait for the game header before checking its pause state.
    await expect(page.getByRole("button", { name: "Pause", exact: true, includeHidden: true })).toBeAttached();
    // left from the pause menu mid-turn: the turn is still paused, clock frozen, so it resumes from there
    const paused = page.getByRole("dialog", { name: "Pause" });
    if (await paused.isVisible()) await paused.getByRole("button", { name: "Weiterspielen" }).click();
  };
  const escapes = async (phase: string, here: () => Promise<void>, beforePlay = false) => {
    if (beforePlay) {
      // before the first turn, back is one step back: to the settings, and since nothing written is lost, no asking
      await here(); // the last Zetteli has landed
      await page.getByRole("button", { name: "Zurück zu den Einstellungen" }).click();
      await expect(ask).toHaveCount(0);
      await page.getByRole("button", { name: "Spiel starten" }).click();
      await here();
    } else {
      // back: "no" keeps you in the game, "yes" goes home, and the game waits there
      await page.getByRole("button", { name: "Zurück" }).click();
      await expect(ask, `${phase}: back asks`).toBeVisible();
      await ask.getByRole("button", { name: "Weiterspielen" }).click();
      await expect(ask).toHaveCount(0);
      await here();
      await page.getByRole("button", { name: "Zurück" }).click();
      await ask.getByRole("button", { name: "Zur Startseite" }).click();
      await home();
      await here();
    }
    // pause menu: resume, and to the start page
    await page.getByRole("button", { name: "Pause" }).click();
    const menu = page.getByRole("dialog", { name: "Pause" });
    await menu.getByRole("button", { name: "Weiterspielen" }).click();
    await expect(menu, `${phase}: resume closes the menu`).toHaveCount(0);
    await here();
    await page.getByRole("button", { name: "Pause" }).click();
    await menu.getByRole("button", { name: "Zur Startseite" }).click();
    await home();
    await here();
    // cancelling asks too: "no" keeps the game
    await page.getByRole("button", { name: "Pause" }).click();
    await menu.getByRole("button", { name: "Spiel abbrechen" }).click();
    await ask.getByRole("button", { name: "Weiterspielen" }).click();
    await expect(ask).toHaveCount(0);
    await menu.getByRole("button", { name: "Weiterspielen" }).click();
    await here();
  };

  await localGame(page, (i) => `Wort${i}`); // everyone has written: the first team is up
  await escapes("before a turn", () => expect(page.getByRole("button", { name: "Los, Zetteli ziehen" })).toBeVisible(), true);
  await page.getByRole("button", { name: "Los, Zetteli ziehen" }).click();
  await escapes("during a turn", () => expect(page.getByTestId("word")).toBeVisible());

  // and while writing: a new game, straight to the first writer
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("dialog", { name: "Pause" }).getByRole("button", { name: "Spiel abbrechen" }).click();
  await ask.getByRole("button", { name: "Spiel abbrechen" }).click();
  await page.getByRole("button", { name: "Spiel starten" }).click();
  await page.getByRole("button", { name: /^Ich bin / }).click();
  await escapes("writing", async () => {
    // back in a one-phone game while writing, the phone is handed over again first: nobody sees the others' Zetteli
    const iAm = page.getByRole("button", { name: /^Ich bin / });
    if (await iAm.isVisible()) await iAm.click();
    await expect(page.getByRole("button", { name: "In die Schüssel" })).toBeVisible();
  }, true);
  // finally cancel for real: back in the lobby, where back needs no asking
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("dialog", { name: "Pause" }).getByRole("button", { name: "Spiel abbrechen" }).click();
  await ask.getByRole("button", { name: "Spiel abbrechen" }).click();
  await expect(page.getByRole("button", { name: "Spiel starten" })).toBeVisible();
  await page.getByRole("button", { name: "Zurück" }).click();
  await expect(page).toHaveURL("/");
});

// one phone: players are dragged between teams by their grip; the name next to it still renames
test("one-phone lobby: drag a player into the other team by the grip, then rename them", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  const box = (name: string) => page.locator("section > div").filter({ has: page.getByText(name, { exact: true }) });
  await expect(box("Lisa")).not.toContainText("Nora"); // they start in different teams
  const grip = page.getByRole("button", { name: "Lisa in ein anderes Team ziehen" });
  await expect(grip).toBeVisible(); // the drag code loads on its own
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished))); // rows settled (they pop in anew once it's there)
  const from = (await grip.boundingBox())!;
  const to = (await box("Nora").boundingBox())!;
  // like a finger: press, a short pause, a steady move, a pause over the target, let go (the drag code measures as it goes)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 12, { steps: 6 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 30 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(box("Nora")).toContainText("Lisa");
  // renaming still works on the moved row
  await box("Nora").locator("li").filter({ hasText: "Lisa" }).getByRole("button", { name: /Umbenennen/ }).click();
  await page.getByRole("textbox", { name: "Dein Name" }).fill("Lisi");
  await page.keyboard.press("Enter");
  await expect(box("Nora")).toContainText("Lisi");
});
