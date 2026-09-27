import { devices, expect, test, type Page } from "@playwright/test";
import { closePhonesAfterEach, phone as openPhone } from "./phones";

// iPhone sizes in Safari's engine: the play screens must fit without scrolling, buttons fully visible, words on one line
test.use({ browserName: "webkit" });
// one of these at a time: each opens up to four WebKit phones, and several in parallel run a laptop out of memory
test.describe.configure({ mode: "default" });
closePhonesAfterEach();
// from the smallest (320 × 568) to the biggest, iPhones and small Androids
const PHONES = ["iPhone SE", "Galaxy S9+", "Galaxy S5", "iPhone SE (3rd gen)", "iPhone 12 Mini", "iPhone 15", "Pixel 5", "iPhone 15 Pro Max"] as const;
const LONG = ["Donaudampfschifffahrt", "Quantenchromodynamik", "Rindfleischetikettierung", "Kaffeemaschinenentkalker"];

/** can the page be scrolled sideways? (tries it, then scrolls back) */
const sideways = (page: Page) => page.evaluate("(() => { const y = scrollY; scrollTo(80, y); const x = scrollX; scrollTo(0, y); return x; })()");

async function fits(page: Page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement!;
    const word = document.querySelector<HTMLElement>("[data-testid=word]");
    const bottom = Math.max(...[...document.querySelectorAll("button")].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().bottom));
    return {
      scrolls: doc.scrollHeight > innerHeight + 1,
      buttonsCut: bottom > innerHeight + 0.5,
      wordWraps: word ? word.scrollWidth > word.clientWidth + 1 || word.getClientRects().length > 1 : false,
    };
  });
}

for (const name of PHONES) {
  test(`${name}: drawing round fits the screen for drawer and watcher; teammate guess flashes`, async ({ browser }) => {
    test.setTimeout(180_000); // four WebKit phones in one test: slow when the machine is busy
    const phone = (b: typeof browser) => openPhone(b, { ...devices[name] });
    const host = await phone(browser);
    await host.goto("/");
    await host.getByRole("button", { name: /Mehrere Handys/ }).click();
    await host.getByLabel("Dein Name").fill("Lisa");
    await host.getByRole("button", { name: "Raum erstellen" }).click();
    await host.waitForURL(/\/r\/[A-Z0-9]{6}$/);
    const code = host.url().split("/").pop()!;
    // the room code (six characters) sits on one line inside its card, next to the QR (feedback: it ran out of the box)
    const fit = await host.locator("section").getByText(code, { exact: true }).evaluate((el) => {
      const r = el.getBoundingClientRect(), card = el.closest("section")!.getBoundingClientRect();
      return { inside: r.right <= card.right - 8, oneLine: r.height < 60 };
    });
    expect(fit, `room code ${code} fits its card`).toEqual({ inside: true, oneLine: true });
    const others = await Promise.all([0, 1, 2].map(() => phone(browser)));
    for (const [i, p] of others.entries()) {
      await p.goto(`/r/${code}`);
      await p.getByLabel("Dein Name").fill(`P${i}`);
      await p.getByRole("button", { name: "Beitreten" }).click();
      await expect(p.getByText("(du)")).toBeVisible();
    }
    const phones = [host, ...others];
    // drawing is already on by default with several phones; drop everything else to leave only it
    for (const r of ["Umschreiben", "Pantomime", "Ein Wort", "Geräusch"]) await host.getByRole("button", { name: `${r} weglassen` }).click();
    for (let i = 0; i < 3; i++) await host.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
    if (name === "iPhone SE") await host.getByRole("button", { name: "Passen pro Zug mehr" }).click();
    await host.getByRole("button", { name: "Spiel starten" }).click();
    for (const [i, p] of phones.entries()) {
      await p.getByLabel("Zetteli 1", { exact: true }).fill(LONG[i]);
      await p.getByRole("button", { name: "In die Schüssel" }).click();
    }

    const go = (p: Page) => p.getByRole("button", { name: "Los, Zetteli ziehen" });
    await expect.poll(async () => (await Promise.all(phones.map((p) => go(p).isVisible()))).filter(Boolean).length, { timeout: 10_000 }).toBe(1);
    const di = (await Promise.all(phones.map((p) => go(p).isVisible()))).indexOf(true);
    const d = phones[di];
    expect(await fits(d)).toMatchObject({ buttonsCut: false }); // ready screen: the start button isn't cut off
    await go(d).click();
    await expect(d.getByRole("img", { name: "Hier zeichnen" })).toBeVisible();
    expect(await fits(d)).toEqual({ scrolls: false, buttonsCut: false, wordWraps: false });
    expect(await sideways(d)).toBe(0); // drawing strokes must never drag the page along

    // draw a line; every watcher gets it, and no watcher screen scrolls either
    const box = (await d.getByRole("img", { name: "Hier zeichnen" }).boundingBox())!;
    await d.mouse.move(box.x + 20, box.y + 20);
    await d.mouse.down();
    for (let i = 1; i <= 8; i++) await d.mouse.move(box.x + 20 + i * 20, box.y + 20 + (i % 2) * 60);
    await d.mouse.up();
    for (const w of phones.filter((p) => p !== d)) {
      await expect.poll(() => w.locator("canvas").evaluate((c: HTMLCanvasElement) => {
        const px = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
        return n;
      }), { timeout: 5_000 }).toBeGreaterThan(30);
      expect(await fits(w)).toMatchObject({ scrolls: false, buttonsCut: false });
    }
    // how smoothly it is traced in is unit-tested (src/lib/pace.test.ts): headless WebKit pauses animation on background pages

    // a teammate calls it: the word counts once and flashes on the other phones
    const mate = phones.find((p, i) => i !== di && i % 2 === di % 2)!; // teams alternate on join
    const word = await d.getByTestId("word").innerText();
    // the flash lasts 1.8 s: the drawer's phone records what it flashed, so a busy test machine can't miss it.
    // (Only the drawer's: a phone only polls while visible, and headless WebKit may count a background test phone as hidden.)
    const watchers = [d];
    await Promise.all(watchers.map((p) => p.evaluate(`(() => { window.__flashes = []; new MutationObserver(() => document.querySelectorAll('[role=status]').forEach((e) => window.__flashes.push(e.textContent))).observe(document.body, { childList: true, subtree: true, characterData: true }); })()`)));
    await mate.getByRole("button", { name: "Erraten" }).click();
    for (const p of watchers) await expect.poll(() => p.evaluate("window.__flashes.join(' ')"), { timeout: 10_000 }).toContain(word);
    await expect(d.getByTestId("word")).not.toHaveText(word);

    const skipped = await d.getByTestId("word").innerText();
    await d.getByRole("button", { name: /^Passen/ }).click();
    const swap = d.getByRole("button", { name: `Zurück zu ${skipped}`, exact: true });
    await expect(swap).toBeVisible();
    await expect.poll(() => fits(d), { message: "drawing with a set-aside Zetteli" }).toEqual({ scrolls: false, buttonsCut: false, wordWraps: false });
    expect(await sideways(d)).toBe(0);
    await swap.click();
    await expect(d.getByTestId("word")).toHaveText(skipped);
    if (name === "iPhone SE") {
      await d.getByRole("button", { name: /^Passen/ }).click();
      await expect(d.getByTestId("word")).not.toHaveText(skipped);
      const held = d.getByRole("button", { name: /^Zurück zu / });
      await expect(held).toHaveCount(2);
      await expect.poll(() => fits(d), { message: "drawing with several set-aside Zetteli" }).toEqual({ scrolls: false, buttonsCut: false, wordWraps: false });
      expect(await sideways(d)).toBe(0);
      await held.last().click(); // scrolls within the row, leaving the game controls on screen
      await expect(d.getByTestId("word")).toHaveText(skipped);
    }
  });
}

test("iPhone SE: long words stay on one line and the swipe screen fits (one phone)", async ({ browser }) => {
  const page = await openPhone(browser, { ...devices["iPhone SE"] });
  await page.goto("/");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await page.getByRole("button", { name: "Spiel starten" }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: /^Ich bin / }).click();
    await page.getByLabel("Zetteli 1", { exact: true }).fill([...LONG, "Streichholzschächtelchen"][i]);
    await page.getByRole("button", { name: "In die Schüssel" }).click();
  }
  expect(await fits(page)).toMatchObject({ buttonsCut: false });
  await page.getByRole("button", { name: "Los, Zetteli ziehen" }).click();
  await expect(page.getByTestId("word")).toBeVisible();
  expect(await fits(page)).toEqual({ scrolls: false, buttonsCut: false, wordWraps: false });
  // one skipped: the set-aside Zetteli shows below, and the buttons must stay on screen (feedback: they slid off mid-turn)
  const first = await page.getByTestId("word").innerText();
  await page.getByRole("button", { name: /^Passen/ }).click();
  await expect(page.getByTestId("word")).not.toHaveText(first);
  await expect(page.getByRole("button", { name: `Zurück zu ${first}` })).toBeVisible();
  await expect.poll(() => fits(page), { message: "turn screen with a set-aside Zetteli", timeout: 3000 }).toEqual({ scrolls: false, buttonsCut: false, wordWraps: false });
});

test("iPhone SE: no screen scrolls sideways and single-screen views fit, through a whole one-phone game with drawing on paper", async ({ browser }) => {
  test.setTimeout(180_000); // a whole game
  const page = await openPhone(browser, { ...devices["iPhone SE"] });
  const check = async (where: string) => expect(await sideways(page), `${where} scrolls sideways`).toBe(0);
  // single-screen views must fit the phone, not scroll for a few pixels (once their animation has settled)
  const fitsTall = (where: string) =>
    expect.poll(() => page.evaluate("document.scrollingElement.scrollHeight - innerHeight"), { message: `${where} scrolls`, timeout: 3000 }).toBeLessThanOrEqual(1);
  await page.goto("/");
  await check("home");
  await page.getByRole("button", { name: "Einstellungen", exact: true }).first().click();
  await check("settings sheet");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  await check("lobby");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  for (const r of ["Pantomime", "Ein Wort", "Geräusch"]) await page.getByRole("button", { name: `${r} weglassen` }).click();
  await page.getByRole("button", { name: "Zeichnen hinzufügen" }).click();
  await page.getByRole("button", { name: "Spiel starten" }).click();
  for (const [i, w] of LONG.entries()) {
    if (!i) await fitsTall("pass the phone");
    await page.getByRole("button", { name: /^Ich bin / }).click();
    await page.getByLabel("Zetteli 1", { exact: true }).fill(w);
    if (!i) {
      await check("write");
      await fitsTall("write");
    }
    await page.getByRole("button", { name: "In die Schüssel" }).click();
  }
  const end = page.getByText("Gewonnen hat").or(page.getByText("Unentschieden"));
  for (let g = 0; g < 40 && !(await end.isVisible()); g++) {
    const go = page.getByRole("button", { name: "Los, Zetteli ziehen" });
    const next = page.getByRole("button", { name: /^Runde \d starten/ });
    await expect(go.or(next).or(page.getByTestId("word")).or(end).first()).toBeVisible();
    if (await go.isVisible()) {
      await check("ready");
      await fitsTall("ready");
      await go.click();
      await expect(page.getByTestId("word")).toBeVisible();
    } else if (await next.isVisible()) {
      await check("round end");
      await fitsTall("round end");
      await next.click();
      await expect(go).toBeVisible();
    } else if (await page.getByTestId("word").isVisible()) {
      // settled, the turn screen fits (drawing on paper too); a moment between two screens may briefly be taller
      await expect.poll(() => fits(page), { message: "turn screen", timeout: 3000 }).toEqual({ scrolls: false, buttonsCut: false, wordWraps: false });
      await page.getByRole("button", { name: "Erraten" }).click();
      await check("right after a guess");
    }
  }
  await expect(end).toBeVisible();
  await check("end stats");
  await page.getByText(/Alle \d+ Zetteli/).click();
  await check("end stats, every Zetteli listed");
  await page.getByRole("button", { name: new RegExp(LONG[0]) }).last().click();
  const story = page.getByRole("dialog");
  await expect(story).toHaveAccessibleName(LONG[0]);
  await check("a long Zetteli's story open");
  expect(await story.evaluate((d) => d.scrollWidth - d.clientWidth), "the story scrolls sideways").toBeLessThanOrEqual(1);
  await story.getByText(/erklärt von/).first().getByRole("button").click(); // on to the player who described it
  await expect(story.getByRole("heading", { name: "Erklärte Zetteli" })).toBeVisible();
  await check("a player's story open");
  expect(await story.evaluate((d) => d.scrollWidth - d.clientWidth), "the player story scrolls sideways").toBeLessThanOrEqual(1);
});

/** the main button stays on screen before any scrolling (sticky at the bottom) */
async function mainButtonOnScreen(page: Page, name: string | RegExp) {
  await page.evaluate(() => scrollTo(0, 0));
  const box = (await page.getByRole("button", { name }).boundingBox())!;
  const h = page.viewportSize()!.height;
  expect(box.y, "main button top").toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, "main button bottom").toBeLessThanOrEqual(h + 0.5);
}

/** every field and button, scrolled into view the way focus does it, is the thing a finger hits: the sticky bars never cover it */
async function allReachable(page: Page) {
  const covered = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main input, main button, main select, main textarea")]
      .filter((el) => el.offsetParent && el.getBoundingClientRect().width > 0)
      .flatMap((el) => {
        el.scrollIntoView({ block: "nearest" });
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit && (el === hit || el.contains(hit) || hit.contains(el)) ? [] : [`${el.tagName} "${el.getAttribute("aria-label") ?? el.textContent?.trim()}" under ${hit?.tagName}.${hit?.className}`];
      }),
  );
  expect(covered).toEqual([]);
}

/** scrolled to the very bottom, the settings button still floats on screen and is what a finger hits */
async function settingsOnScreen(page: Page) {
  await page.evaluate(() => scrollTo(0, document.scrollingElement!.scrollHeight));
  await expect.poll(() => page.evaluate("scrollY"), { message: "page scrolls" }).toBeGreaterThan(0);
  const settings = page.getByRole("button", { name: "Einstellungen", exact: true });
  const box = (await settings.boundingBox())!;
  expect(box.y, "settings top").toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, "settings bottom").toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await settings.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (el === hit || el.contains(hit));
  }), "settings is what a tap hits").toBe(true);
}

test("iPhone SE: the settings controls stay on screen while the page scrolls (home with 8 players, lobby)", async ({ browser }) => {
  const page = await openPhone(browser, { ...devices["iPhone SE"] });
  await page.goto("/");
  await page.getByRole("button", { name: /Ein Handy/ }).click();
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Spieler hinzufügen" }).click();
  await settingsOnScreen(page);
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  await expect(page.getByRole("button", { name: "Spiel starten" })).toBeVisible();
  await settingsOnScreen(page);
});

for (const name of ["iPhone SE", "iPhone 15"] as const) {
  test(`${name}: main buttons stay sticky and every field stays reachable (home with many players, lobby)`, async ({ browser }) => {
    const page = await openPhone(browser, { ...devices[name] });
    await page.goto("/");
    await page.getByRole("button", { name: /Ein Handy/ }).click();
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Spieler hinzufügen" }).click();
    // the last, freshly added row: type into it, then everything is still reachable and the button still on screen
    const last = page.getByLabel("Spieler 8", { exact: true });
    await last.fill("Zuletzt");
    await expect(last).toHaveValue("Zuletzt");
    await allReachable(page);
    await mainButtonOnScreen(page, "Neues Spiel");
    // one-phone lobby with eight players: the longest settings page
    await page.getByRole("button", { name: "Neues Spiel" }).click();
    await page.waitForURL(/\/local$/);
    await mainButtonOnScreen(page, "Spiel starten");
    await allReachable(page);

    await page.goto("/");
    await page.getByRole("button", { name: /Mehrere Handys/ }).click();
    await page.getByLabel("Dein Name").fill("Lisa");
    await page.getByRole("button", { name: "Raum erstellen" }).click();
    await page.waitForURL(/\/r\/[A-Z0-9]{6}$/);
    await mainButtonOnScreen(page, "Jedes Team braucht 2 Leute");
    await allReachable(page);
    expect(await sideways(page)).toBe(0);
  });
}

// feedback: after "Raum beitreten" you had to scroll to find where the code goes (it was behind the start button)
test("iPhone SE: joining a room brings the code field and the scan button into view, ready to type", async ({ browser }) => {
  const page = await openPhone(browser, { ...devices["iPhone SE"] });
  await page.goto("/");
  await page.getByRole("button", { name: /Mehrere Handys/ }).click();
  await page.getByRole("button", { name: /^Raum beitreten/ }).click();
  const field = page.getByLabel("Raumcode");
  await expect(field).toBeFocused();
  for (const target of [field, page.getByRole("button", { name: "Scannen" })]) {
    // settled after the smooth scroll: on screen and really what a finger hits (not the fixed start bar)
    await expect
      .poll(() =>
        target.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return r.top >= 0 && r.bottom <= innerHeight && !!hit && (el === hit || el.contains(hit));
        }),
      )
      .toBe(true);
  }
});

/** the tour's state: which step is on, where each chapter's top sits, and the line just under the pinned scene */
const tour = (page: Page) =>
  page.evaluate(() => {
    const pin = document.querySelector<HTMLElement>("main .sticky")!.getBoundingClientRect().bottom;
    const tops = [...document.querySelectorAll("main section")].map((s) => s.getBoundingClientRect().top);
    const current = document.querySelector("[aria-current=step]")?.getAttribute("aria-label");
    // snapping on, and no tap still on its way (chapters snap-stop again once it has arrived)
    const snapping = document.documentElement.style.scrollSnapType === "y mandatory" && !document.querySelector("main section.snap-normal");
    return { under: pin + 8, tops, current, snapping };
  });

for (const name of ["iPhone SE", "iPhone 15"] as const) {
  test(`${name}: the tour lands every chapter just under the scene, by tap and by swipe, and stops at the end`, async ({ browser }) => {
    const page = await openPhone(browser, { ...devices[name] });
    await page.goto("/anleitung");
    const steps = page.getByRole("navigation", { name: "So geht's" }).getByRole("button");
    const names = await steps.evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")!));
    expect(names).toHaveLength(10);

    // a tap goes to that chapter, not a neighbour: its heading right under the scene; the players stay inside the scene
    for (const [i, n] of names.entries()) {
      await steps.nth(i).click();
      await expect.poll(async () => (await tour(page)).current).toBe(n);
      await expect.poll(async () => (await tour(page)).snapping).toBe(true);
      const t = await tour(page);
      expect(Math.abs(t.tops[i] - t.under), `${n} under the scene`).toBeLessThan(2);
      await page.waitForTimeout(800); // the players' spring into place
      const out = await page.evaluate(() => {
        const stage = document.querySelector("main .sticky [aria-hidden] > div")!.getBoundingClientRect();
        return [...document.querySelectorAll("main .sticky span")]
          .filter((s) => ["Lisa", "Nora", "Tim", "Nelly"].includes(s.textContent ?? ""))
          .filter((s) => {
            const r = s.getBoundingClientRect();
            return r.left < stage.left - 1 || r.right > stage.right + 1 || r.top < stage.top - 1 || r.bottom > stage.bottom + 1;
          })
          .map((s) => s.textContent);
      });
      expect(out, `${n}: players cut off at the scene's edge`).toEqual([]);
    }

    // a swipe moves on exactly one chapter and snaps it under the scene
    await steps.first().click();
    await expect.poll(async () => (await tour(page)).snapping).toBe(true);
    for (let i = 0; i < names.length - 1; i++) {
      const t = await tour(page);
      await page.evaluate((d) => scrollBy(0, d), (t.tops[i + 1] - t.tops[i]) * 0.6);
      await expect.poll(async () => Math.abs((await tour(page)).tops[i + 1] - t.under), { message: `${names[i + 1]}: snapped under the scene` }).toBeLessThan(2);
      await expect.poll(async () => (await tour(page)).current).toBe(names[i + 1]);
    }

    // the end: the last chapter on, "Los geht's" fully on screen, and no empty page below it to scroll into
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(500);
    const end = await tour(page);
    expect(end.current).toBe(names.at(-1));
    expect(end.tops.at(-1)!).toBeLessThan(end.under + 2);
    await expect(page.getByRole("link", { name: "Los geht's" })).toBeInViewport({ ratio: 1 });
    const below = await page.evaluate(() => innerHeight - [...document.querySelectorAll("main a")].pop()!.getBoundingClientRect().bottom);
    expect(below, "space under the button").toBeLessThan(160);
  });
}
