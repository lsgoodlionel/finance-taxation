import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  passWithNoTests: true,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "artifacts/v4/baseline/browser/results.json" }]
  ],
  use: {
    baseURL: process.env.V4_BASE_URL ?? "http://127.0.0.1:55173",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai"
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet-chromium", use: { ...devices["iPad Pro 11"] } }
  ],
  outputDir: "artifacts/v4/baseline/browser/results"
});
