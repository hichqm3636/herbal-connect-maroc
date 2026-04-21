import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — UI E2E tests with mocked Supabase REST/auth.
 *
 * Boots the Vite dev server, runs each spec against it, and lets every
 * spec install its own `page.route()` handlers to fake Supabase responses.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
