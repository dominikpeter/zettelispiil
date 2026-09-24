import { defineConfig, devices } from "@playwright/test";

// mobile-first app → test on a phone viewport; runs against `next dev` (in-memory rooms, no Redis needed)
// or against a deployment: BASE_URL=https://… npm run e2e
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { ...devices["Pixel 7"], baseURL, trace: "retain-on-failure" },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
