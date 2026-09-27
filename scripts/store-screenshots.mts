// App Store screenshots: plays a short one-phone game and saves the screens Apple asks for, for iPhone (6.5") and
// iPad (13"). Run `just store-shots` with the dev server up; the JPEGs land in assets/app-store/{iphone,ipad}.
import { webkit } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const DEVICES = {
  iphone: { viewport: { width: 428, height: 926 }, deviceScaleFactor: 3 }, // 1284 × 2778
  ipad: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2 }, // 2048 × 2732
};

const browser = await webkit.launch();
for (const [name, size] of Object.entries(DEVICES)) {
  const out = `assets/app-store/${name}`;
  const ctx = await browser.newContext({ ...size, isMobile: true, hasTouch: true, colorScheme: "light", locale: "de-CH" });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("lang", "de");
    localStorage.setItem("install-hint-done", "1");
  });
  const shot = async (n: string) => {
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }); // the dev server's badge
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${out}/${n}.jpg`, type: "jpeg", quality: 92 });
    console.log(name, n);
  };
  const btn = (label: string | RegExp, exact = false) => page.getByRole("button", { name: label, exact });

  await page.goto(base + "/");
  await page.evaluate(() => localStorage.removeItem("zettelispiil:localgame"));
  await page.goto(base + "/");
  await shot("1-home");
  await btn("Neues Spiel", true).click();
  await page.waitForURL(/\/local$/);
  await shot("2-lobby");
  for (let i = 0; i < 3; i++) await btn("Zetteli pro Person weniger").click();
  for (const r of ["Pantomime", "Ein Wort", "Geräusch"]) await btn(`${r} weglassen`).click();
  await btn("Spiel starten").click();
  for (const w of ["Matterhorn", "Rösti", "Alphorn", "Fondue"]) {
    await btn(/^Ich bin /).click();
    await page.getByLabel("Zetteli 1", { exact: true }).fill(w);
    await btn("In die Schüssel").click();
  }
  await shot("4-pass-phone");
  await btn("Los, Zetteli ziehen").click();
  await page.getByTestId("word").waitFor();
  await shot("3-turn");
  const end = page.getByText(/Gewonnen hat|Unentschieden/).first();
  for (let i = 0; i < 8 && !(await end.isVisible()); i++) {
    await btn("Erraten", true).click().catch(() => {});
    await page.waitForTimeout(700);
  }
  await end.waitFor({ timeout: 20000 });
  await page.waitForTimeout(3500); // let the confetti settle a little
  await page.evaluate(() => scrollTo(0, 0));
  await shot("5-winner");
  await page.evaluate(() => scrollTo(0, 700));
  await shot("6-awards");
  await page.getByRole("button", { name: /^Matterhorn/ }).first().click();
  await shot("7-zetteli-story");
  await ctx.close();
}
await browser.close();
