import { expect, test } from "@playwright/test";

// scrolling the home page tosses a few hero slips into the bowl. Feedback: they passed through its wall and hung out
// below it, and at rest the side slips dipped below the rim outside it ("inside but still outside the bowl"). Every
// slip is checked at every scroll step against the bowl's own SVG shape: like real paper, nothing ever shows below the
// rim outside the bowl (whatever is below the rim is inside it, hidden by its front); landed, each tossed slip sits in
// the bowl with its top peeking out.
for (const vp of [{ width: 320, height: 568 }, { width: 412, height: 700 }])
  for (const seed of [0, 0.5, 0.99]) // Math.random pinned: another set of words, so other slip widths
    test(`hero: slips tossed on scroll land in the bowl, never through its wall (${vp.width}px, words ${seed})`, async ({ browser }) => {
      const page = await browser.newPage({ viewport: vp, isMobile: true, hasTouch: true });
      await page.addInitScript((r) => (Math.random = () => r), seed);
      await page.goto("/");
      test.skip(!(await page.evaluate(() => CSS.supports("animation-timeline: scroll()"))), "no scroll-driven animations here");
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200); // the unfold entrance is done
      expect(await page.locator(".drop-in").count()).toBeGreaterThanOrEqual(5); // the big one in the middle and the one behind it fall in too

      for (let y = 0; y <= 80; y += 4) {
        await page.evaluate((y) => scrollTo(0, y), y);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const state = await page.evaluate(() => {
          const hero = document.querySelector(".drop-in")!.parentElement!;
          const svg = hero.querySelector("svg")!;
          const bowl = svg.querySelector("path")!; // the bowl's body
          const sb = svg.getBoundingClientRect();
          const k = sb.width / 120;
          const rimY = sb.top + 34 * k;
          const hr = hero.getBoundingClientRect();
          return [...hero.querySelectorAll<HTMLElement>(".slip")].filter((el) => el.offsetParent).map((el) => {
            const cs = getComputedStyle(el);
            const [ox, oy] = cs.transformOrigin.split(" ").map(parseFloat);
            const [tx = 0, ty = 0] = cs.translate === "none" ? [] : cs.translate.split(" ").map(parseFloat);
            const rot = cs.rotate === "none" ? 0 : parseFloat(cs.rotate);
            const sc = cs.scale === "none" ? 1 : parseFloat(cs.scale);
            // CSS order: translate, rotate, scale, then transform, all around transform-origin
            const m = new DOMMatrix().translate(ox, oy).translate(tx, ty).rotate(rot).scale(sc).multiply(new DOMMatrix(cs.transform === "none" ? undefined : cs.transform)).translate(-ox, -oy);
            const corners = [[0, 0], [el.offsetWidth, 0], [0, el.offsetHeight], [el.offsetWidth, el.offsetHeight]].map(([x, y]) => {
              const p = m.transformPoint(new DOMPoint(x, y));
              return { x: hr.left + el.offsetLeft + p.x, y: hr.top + el.offsetTop + p.y };
            });
            const inBowl = (p: { x: number; y: number }) => bowl.isPointInFill(new DOMPoint((p.x - sb.left) / k, (p.y - sb.top) / k));
            return {
              word: el.innerText,
              drops: el.classList.contains("drop-in"),
              below: corners.filter((p) => p.y > rimY + 1).length,
              out: Math.max(0, ...corners.filter((p) => p.y > rimY && !inBowl(p)).map((p) => p.y - rimY)), // px of paper below the rim, outside the bowl
              above: corners.filter((p) => p.y < rimY - 1).length,
            };
          });
        });
        for (const s of state) expect(s.out, `scroll ${y}px: "${s.word}" hangs ${s.out.toFixed(1)}px below the rim outside the bowl`).toBeLessThanOrEqual(0.5);
        if (y >= 72) // the throw is over (range 0 to 4rem): every slip is in the bowl, peeking out over the rim
          for (const s of state.filter((s) => s.drops)) {
            expect(s.out, `"${s.word}" landed with paper outside the bowl`).toBeLessThanOrEqual(0.5);
            expect(s.below, `"${s.word}" sits in the bowl`).toBeGreaterThanOrEqual(2);
            expect(s.above, `"${s.word}" still shows above the rim`).toBeGreaterThanOrEqual(1);
          }
      }
      await page.close();
    });
