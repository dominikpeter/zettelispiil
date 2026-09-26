import { expect, test } from "@playwright/test";

// the pile of Zetteli above the title on the home page: it should read as a full bowl, not a few scattered slips.
// Feedback on the 7-slip pile: a big empty space between the outer slips (left and right) and the small ones in the bowl.
test.use({ reducedMotion: "reduce" }); // measure where the slips land, not mid-unfold

test("home hero: a dense pile, no big empty space between the outer slips and the ones in the bowl", async ({ page }) => {
  // the words are shuffled on every visit and slip widths follow the words: pin the draw (keys all 0 → lists in order) so the measure is stable
  await page.addInitScript(() => (Math.random = () => 0));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Zettelispiil" })).toBeVisible();
  const hero = page.locator(".slip").first().locator("..");
  const h = (await hero.boundingBox())!;
  const boxes = (
    await hero.locator(":scope > .slip").evaluateAll((els) =>
      els.filter((e) => getComputedStyle(e).display !== "none").map((e) => {
        const r = e.getBoundingClientRect();
        return { word: e.textContent ?? "", top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      }),
    )
  ).map((b) => ({ ...b, top: Math.round(b.top - h.y), bottom: Math.round(b.bottom - h.y), left: Math.round(b.left - h.x), right: Math.round(b.right - h.x) }));
  const layout = boxes.map((b) => `${b.word}[x ${b.left}-${b.right}, y ${b.top}-${b.bottom}]`).join(", ");
  const size = `hero ${Math.round(h.width)}×${Math.round(h.height)}px`;

  // 1. more slips: at least 9 visible (the sparse pile had 7)
  expect.soft(boxes.length, `visible hero slips, ${size}: ${layout}`).toBeGreaterThanOrEqual(9);

  // 2. at the height of the slips sitting in the bowl (the lowest slip), walk left to right across every slip that reaches
  //    that height: no empty stretch between neighbours wider than 10% of the hero (the gaps next to the bowl pile)
  const low = boxes.reduce((a, b) => (b.bottom > a.bottom ? b : a));
  const band = { top: low.top, bottom: low.bottom };
  const row = boxes.filter((b) => b.bottom > band.top + 4 && b.top < band.bottom - 4).sort((a, b) => a.left - b.left);
  let reach = row[0].right;
  let worst = { gap: 0, between: "" };
  for (const b of row.slice(1)) {
    if (b.left - reach > worst.gap) worst = { gap: b.left - reach, between: `${row.find((r) => r.right === reach)?.word} → ${b.word}` };
    reach = Math.max(reach, b.right);
  }
  expect(worst.gap, `widest empty stretch at bowl height (y ${band.top}-${band.bottom}) is ${worst.gap}px (${worst.between}), ${size}: ${layout}`).toBeLessThanOrEqual(h.width * 0.1);
});
