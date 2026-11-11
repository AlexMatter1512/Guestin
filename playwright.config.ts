import { defineConfig } from "@playwright/test";

const basePath = process.env.LANDING_BASE_PATH || "/";
const baseURL = `http://127.0.0.1:4179${basePath}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    browserName: "chromium",
    channel: "chromium",
    viewport: { width: 1440, height: 1000 },
    locale: "en-GB",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "bun run preview --host 127.0.0.1 --port 4179 --strictPort",
    url: baseURL,
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
