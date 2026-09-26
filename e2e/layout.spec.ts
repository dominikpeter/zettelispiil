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
    await host.waitForURL(/\/r\/[A-Z0-9]{5}$/);
    const code = host.url().split("/").pop()!;
    const others = await Promise.all([0, 1, 2].map(() => phone(browser)));
    for (const [i, p] of others.entries()) {
      await p.goto(`/r/${code}`);
      await p.getByLabel("Dein Name").fill(`P${i}`);
      await p.getByRole("button", { name: "Beitreten" }).click();
      await expect(p.getByText("(du)")).toBeVisible();
    }
    const phones = [host, ...others];
    await host.getByRole("button", { name: "Zeichnen hinzufügen" }).click();
    for (const r of ["Umschreiben", "Pantomime", "Ein Wort", "Geräusch"]) await host.getByRole("button", { name: `${r} weglassen` }).click();
    for (let i = 0; i < 3; i++) await host.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
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
    if (!i) (await check("write"), await fitsTall("write"));
    await page.getByRole("button", { name: "In die Schüssel" }).click();
  }
  const end = page.getByText("Gewonnen hat").or(page.getByText("Unentschieden"));
  for (let g = 0; g < 40 && !(await end.isVisible()); g++) {
    const go = page.getByRole("button", { name: "Los, Zetteli ziehen" });
    const next = page.getByRole("button", { name: /^Runde \d starten/ });
    await expect(go.or(next).or(page.getByTestId("word")).or(end).first()).toBeVisible();
    if (await go.isVisible()) (await check("ready"), await fitsTall("ready"), await go.click());
    else if (await next.isVisible()) (await check("round end"), await fitsTall("round end"), await next.click());
    else if (await page.getByTestId("word").isVisible()) {
      // settled, the turn screen fits (drawing on paper too); a moment between two screens may briefly be taller
      await expect.poll(() => fits(page), { message: "turn screen", timeout: 3000 }).toEqual({ scrolls: false, buttonsCut: false, wordWraps: false });
      await page.getByRole("button", { name: "Erraten" }).click();
      await check("right after a guess");
    }
  }
  await expect(end).toBeVisible();
  await page.getByText(/Alle \d+ Zetteli/).click();
  await page.locator("summary").filter({ hasText: LONG[0] }).last().click();
  await check("end stats with details open");
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
    await page.waitForURL(/\/r\/[A-Z0-9]{5}$/);
    await mainButtonOnScreen(page, "Jedes Team braucht 2 Leute");
    await allReachable(page);
    expect(await sideways(page)).toBe(0);
  });
}
