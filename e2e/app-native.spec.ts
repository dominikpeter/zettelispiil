import { devices, expect, test } from "@playwright/test";

// The iPhone app's own native plugins (ios/App/App/*.swift): the coffees as In-App Purchases and Sign in with Apple.
// Here the page runs as if inside the app: Capacitor sees an "ios" platform whose native plugins are fakes answering
// like StoreKit and Apple's sign-in sheet would.
test.use({ ...devices["iPhone 15"], browserName: "webkit" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.CapacitorCustomPlatform = { name: "ios" };
    w.Capacitor = {
      // what the app's native bridge injects before the page runs
      isNativePlatform: () => true,
      isPluginAvailable: (name: string) => name === "Coffee" || name === "AppleSignIn",
      PluginHeaders: [
        { name: "Coffee", methods: [{ name: "products", rtype: "promise" }, { name: "buy", rtype: "promise" }] },
        { name: "AppleSignIn", methods: [{ name: "authorize", rtype: "promise" }] },
      ],
      nativePromise: async (plugin: string, method: string, o: { ids?: string[]; id?: string; nonce?: string }) => {
        if (plugin === "AppleSignIn") return { identityToken: `token-for-${o.nonce}`, authorizationCode: "apple-code", givenName: "Lisa", familyName: "Muster" };
        if (plugin !== "Coffee") throw new Error("not in this fake");
        if (method === "products") return { products: o.ids!.map((id, i) => ({ id, price: ["CHF 1.00", "CHF 5.00", "CHF 10.00"][i] })) };
        (window as unknown as { bought?: string }).bought = o.id;
        return { status: "purchased" };
      },
    };
  });
});

test("in the app: the coffees come from the App Store, with its prices, and a purchase says thanks", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Einstellungen", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Spendier mir einen Kaffee" })).toBeVisible();
  await expect(page.getByText("Bezahlt wird über den App Store.")).toBeVisible();
  await expect(page.getByText(/Stripe/)).toHaveCount(0); // no Stripe inside the app
  await expect(page.getByLabel("Eigener Betrag in CHF")).toHaveCount(0); // Apple only has fixed prices
  await page.getByRole("button", { name: "Grosser Kaffee, CHF 5.00" }).click();
  await expect(page.getByRole("status")).toHaveText("Merci für den Kaffee! Das freut mich riesig.");
  expect(await page.evaluate(() => (window as unknown as { bought?: string }).bought)).toBe("ch.zettelispiil.coffee.big");
});

test("in the app: Sign in with Apple uses Apple's own sheet and hands its token to the server", async ({ page }) => {
  await page.route("**/api/ai/status", (r) => r.fulfill({ json: { ai: true, login: true, providers: ["apple", "google", "email"], user: null } }));
  let sent: { provider?: string; idToken?: { token: string; nonce: string; user?: { name?: { firstName?: string } } } } = {};
  await page.route("**/api/auth/sign-in/social", (r) => {
    sent = r.request().postDataJSON();
    return r.fulfill({ status: 401, json: { code: "INVALID_TOKEN" } }); // the fake token; the server's check is Better Auth's
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Einstellungen", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Mit Google anmelden" })).toHaveCount(0); // Google refuses sign-ins inside apps
  await page.getByRole("button", { name: "Mit Apple anmelden" }).click();
  await expect.poll(() => sent.provider).toBe("apple");
  expect(sent.idToken!.token).toBe(`token-for-${sent.idToken!.nonce}`); // the nonce Apple signed is the one sent along
  expect(sent.idToken!.user?.name?.firstName).toBe("Lisa"); // Apple's name, only there the first time
});

test("in the app: deleting an Apple account asks Apple once more, so the server can revoke Apple's tokens", async ({ page }) => {
  let user: { name: string; email: string } | null = null;
  await page.route("**/api/ai/status", (r) => r.fulfill({ json: { ai: true, login: true, providers: ["apple", "email"], user } }));
  await page.route("**/api/auth/sign-in/social", (r) => {
    user = { name: "Lisa Muster", email: "lisa@privaterelay.appleid.com" };
    return r.fulfill({ json: { redirect: false, token: "t", user: { id: "1", ...user } } });
  });
  let deleted: { appleCode?: string } | null = null;
  await page.route("**/api/account/delete", (r) => ((deleted = r.request().postDataJSON()), r.fulfill({ json: { ok: true } })));
  await page.route("**/api/auth/sign-out", (r) => ((user = null), r.fulfill({ json: { success: true } })));
  await page.goto("/");
  await page.getByRole("button", { name: "Einstellungen", exact: true }).first().click();
  await page.getByRole("button", { name: "Mit Apple anmelden" }).click();
  await expect(page.getByText("Lisa Muster")).toBeVisible();
  await page.getByRole("button", { name: "Konto löschen" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Konto löschen" }).click();
  await expect.poll(() => deleted?.appleCode).toBe("apple-code"); // Apple's fresh code went to the server
  await expect(page.getByRole("button", { name: "Mit Apple anmelden" })).toBeVisible(); // and the phone is signed out
});

for (const [what, code, message] of [
  ["closed by the player", "CANCELLED", false],
  ["refused by Apple (e.g. the app build lacks the entitlement)", "", true],
] as const) {
  test(`in the app: Apple's sheet ${what}: ${message ? "it says so" : "nothing to report"}`, async ({ page }) => {
    await page.addInitScript((code) => {
      const cap = (window as unknown as { Capacitor: { nativePromise: (p: string, m: string, o: unknown) => Promise<unknown> } }).Capacitor;
      const real = cap.nativePromise;
      cap.nativePromise = (p, m, o) => (p === "AppleSignIn" ? Promise.reject(Object.assign(new Error("The operation couldn't be completed."), code ? { code } : {})) : real(p, m, o));
    }, code);
    await page.route("**/api/ai/status", (r) => r.fulfill({ json: { ai: true, login: true, providers: ["apple", "email"], user: null } }));
    let asked = 0;
    await page.route("**/api/auth/sign-in/social", (r) => (asked++, r.fulfill({ status: 500 })));
    await page.goto("/");
    await page.getByRole("button", { name: "Einstellungen", exact: true }).first().click();
    await page.getByRole("button", { name: "Mit Apple anmelden" }).click();
    await page.waitForTimeout(800);
    expect(asked).toBe(0); // no token, nothing sent to the server
    await expect(page.getByText("Anmelden hat nicht geklappt. Versuch es nochmals.")).toHaveCount(message ? 1 : 0);
  });
}
