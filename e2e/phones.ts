import { test, type Browser, type BrowserContext, type BrowserContextOptions } from "@playwright/test";

// Extra phones = extra browser contexts, each polling the server. Left open they pile up test after test
// and choke the machine, so every phone a test opened is closed when it ends.
const open = new Set<BrowserContext>();

/** a fresh phone (own browser context, own localStorage), closed automatically after the test */
export async function phone(browser: Browser, options: BrowserContextOptions = test.info().project.use) {
  const ctx = await browser.newContext(options);
  open.add(ctx);
  return ctx.newPage();
}

/** call once at the top of a spec file that uses phone() */
export const closePhonesAfterEach = () =>
  test.afterEach(async () => {
    await Promise.all([...open].map((c) => c.close().catch(() => {})));
    open.clear();
  });
