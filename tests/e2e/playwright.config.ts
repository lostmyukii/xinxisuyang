import { defineConfig, devices } from "@playwright/test";

const testKey = Buffer.alloc(32, 5).toString("base64");

export default defineConfig({
  testDir: "./specs",
  outputDir: "../../test-results/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "../../playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4180",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    channel: "chrome",
  },
  webServer: [
    {
      command: `NODE_ENV=test COLUMN_KEY_BASE64=${testKey} DATABASE_PATH=:memory: PORT=4319 PAIRING_TOKEN=e2e-token WEB_ORIGIN=http://127.0.0.1:4180 pnpm --filter @xinxisuyang/server dev`,
      url: "http://127.0.0.1:4319/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "VITE_API_BASE=http://127.0.0.1:4319 pnpm --filter @xinxisuyang/web exec vite --host 127.0.0.1 --port 4180 --strictPort",
      url: "http://127.0.0.1:4180",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
