import { defineConfig, devices } from "@playwright/test";

// mobile-first app → test on a phone viewport against a production build (in-memory rooms, no Redis needed)
// or against a deployment: BASE_URL=https://… npm run e2e
const baseURL = process.env.BASE_URL ?? "http://localhost:3217";
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  use: { ...devices["Pixel 7"], baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "npm run build && npx next start -p 3217", url: baseURL, reuseExistingServer: true, timeout: 180_000 },
});
