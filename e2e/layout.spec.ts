import { devices, expect, test, type Browser, type Page } from "@playwright/test";

// iPhone sizes in Safari's engine: the play screens must fit without scrolling, buttons fully visible, words on one line
test.use({ browserName: "webkit" });
const PHONES = ["iPhone SE", "iPhone SE (3rd gen)", "iPhone 15", "iPhone 15 Pro Max"] as const;
const LONG = ["Donaudampfschifffahrt", "Quantenchromodynamik", "Rindfleischetikettierung", "Kaffeemaschinenentkalker"];

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
    const phone = async (b: Browser) => (await b.newContext({ ...devices[name] })).newPage();
    const host = await phone(browser);
    await host.goto("/");
    await host.getByRole("button", { name: /Jedes Handy/ }).click();
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

    // a teammate calls it: the word counts once and flashes on the other phones
    const mate = phones.find((p, i) => i !== di && i % 2 === di % 2)!; // teams alternate on join
    const word = await d.getByTestId("word").innerText();
    await mate.getByRole("button", { name: "Erraten" }).click();
    for (const p of phones.filter((x) => x !== mate)) await expect(p.getByRole("status").filter({ hasText: word })).toBeVisible();
    await expect(d.getByTestId("word")).not.toHaveText(word);
  });
}

test("iPhone SE: long words stay on one line and the swipe screen fits (one phone)", async ({ browser }) => {
  const page = await (await browser.newContext({ ...devices["iPhone SE"] })).newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zetteli pro Person weniger" }).click();
  await page.getByRole("button", { name: "Spiel starten" }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: /^Ich bin / }).click();
    await page.getByLabel("Zetteli 1", { exact: true }).fill([...LONG, "Streichholzschächtelchen"][i]);
    await page.getByRole("button", { name: "In die Schüssel" }).click();
  }
  expect(await fits(page)).toMatchObject({ buttonsCut: false });
  await page.getByRole("button", { name: "Los, Zetteli ziehen" }).click();
  await expect(page.getByTestId("word")).toBeVisible();
  expect(await fits(page)).toEqual({ scrolls: false, buttonsCut: false, wordWraps: false });
});
