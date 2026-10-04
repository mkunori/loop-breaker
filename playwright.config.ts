import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL:
      process.env.PAGES_SMOKE_URL ?? "http://127.0.0.1:4173/loop-breaker/",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-320",
      use: { browserName: "chromium", viewport: { width: 320, height: 800 } },
    },
    {
      name: "mobile-360",
      use: { browserName: "chromium", viewport: { width: 360, height: 800 } },
    },
    {
      name: "mobile-390",
      use: { browserName: "chromium", viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: process.env.PAGES_SMOKE_URL
    ? undefined
    : {
        command: "npm run preview -- --port 4173",
        port: 4173,
        reuseExistingServer: !process.env.CI,
      },
});
