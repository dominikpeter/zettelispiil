import { defineConfig, devices } from "@playwright/test";

// mobile-first app → test on a phone viewport against a production build (in-memory rooms, no Redis needed)
// or against a deployment: BASE_URL=https://… npm run e2e
const port = process.env.E2E_PORT ?? "3217"; // parallel checkouts (worktrees) each take their own port
const baseURL = process.env.BASE_URL ?? `http://localhost:${port}`;
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  use: { ...devices["Pixel 7"], baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: `OPENAI_API_KEY= npm run build && OPENAI_API_KEY= E2E_HECKLE_DICE=always npx next start -p ${port}` /* AI off: fast, free, deterministic */, url: baseURL, reuseExistingServer: true, timeout: 180_000 },
});
