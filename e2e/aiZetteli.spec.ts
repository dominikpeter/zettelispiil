import { expect, test, type Page } from "@playwright/test";

// "KI schreibt": the AI writes every Zetteli, nobody knows a word beforehand. AI status and answer are mocked
// (the local test server has no key); the one-phone game is the quickest way through a whole game.
const WORDS = ["Kuckucksuhr", "Gletscher", "Sackmesser", "Steinbock"]; // none of them in a funny team name
const aiOn = (page: Page) => page.route("**/api/ai/status", (r) => r.fulfill({ json: { ai: true, login: false, providers: [], user: null } }));

async function lobby(page: Page) {
  await aiOn(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Neues Spiel" }).click();
  await page.waitForURL(/\/local$/);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zetteli pro Person weniger" }).click(); // 4 players × 1
  await page.getByRole("button", { name: "Pantomime weglassen" }).click();
  await page.getByRole("button", { name: "Geräusch weglassen" }).click();
}

test("KI schreibt: the host picks two topics, nobody writes, no word shows before its turn, the stats say 'von KI'", async ({ page }) => {
  let asked: { count: number; topics: string[]; lang: string } | null = null;
  let answer = () => {};
  const answered = new Promise<void>((ok) => (answer = ok));
  await page.route("**/api/ai/zetteli", async (route) => {
    asked = route.request().postDataJSON();
    await answered; // hold the answer so the waiting screen can be checked
    await route.fulfill({ json: { ai: true, words: WORDS.map((word) => ({ word, hint: `Tipp zu ${word}` })) } });
  });
  await lobby(page);

  // players write by default; the AI option shows because AI is on here
  await expect(page.getByRole("button", { name: "Selber schreiben" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Tiere", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "KI schreibt" }).click();
  await expect(page.getByRole("button", { name: "Alle Themen" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Tiere", exact: true }).click();
  await page.getByRole("button", { name: "Schwiiz", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tiere", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Alle Themen" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Spiel starten" }).click();

  // no writing: the AI writes, and nobody sees what
  await expect(page.getByText("KI schreibt die Zetteli")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Ich bin / })).toHaveCount(0);
  expect(asked).toEqual({ count: 4, topics: ["animals", "switzerland"], lang: "de", room: null });
  answer();

  // straight to the first turn; the words stay hidden until the describer draws one
  const go = page.getByRole("button", { name: "Los, Zetteli ziehen" });
  await expect(go).toBeVisible();
  for (const w of WORDS) await expect(page.getByText(w, { exact: true })).toHaveCount(0);

  // play to the end
  const end = page.getByText("Gewonnen hat").or(page.getByText("Unentschieden"));
  let first = true;
  for (let guard = 0; guard < 40 && !(await end.isVisible()); guard++) {
    const next = page.getByRole("button", { name: /^Runde \d starten/ });
    await expect(go.or(next).or(page.getByTestId("word")).or(end).first()).toBeVisible();
    if (await go.isVisible()) await go.click();
    else if (await next.isVisible()) await next.click();
    else if (await page.getByTestId("word").isVisible()) {
      const w = await page.getByTestId("word").innerText();
      expect(WORDS).toContain(w);
      if (first) await expect(page.getByText(`Tipp zu ${w}`)).toBeVisible(); // the AI's hint for the describer
      first = false;
      await page.getByRole("button", { name: "Erraten" }).click();
      await expect(page.getByTestId("word").filter({ hasText: w })).toHaveCount(0);
    }
  }
  await expect(end).toBeVisible();
  await page.getByText("Alle 4 Zetteli").click();
  await expect(page.getByText("von KI").first()).toBeVisible();
});

test("KI schreibt: when the AI can't, the host switches to writing their own", async ({ page }) => {
  await page.route("**/api/ai/zetteli", (r) => r.fulfill({ json: { ai: false, error: "ai_failed" } }));
  await lobby(page);
  await page.getByRole("button", { name: "KI schreibt" }).click();
  await page.getByRole("button", { name: "Spiel starten" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "keine Zetteli" })).toBeVisible();
  await page.getByRole("button", { name: "Selber schreiben" }).click();
  await page.getByRole("button", { name: /^Ich bin / }).click();
  await expect(page.getByLabel("Zetteli 1", { exact: true })).toBeVisible();
});
