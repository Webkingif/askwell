import { defineConfig, devices } from "@playwright/test";

const HOST_PORT = Number(process.env.HOST_PORT ?? 4321);
const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  outputDir: "../../test-results/e2e-widget",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${HOST_PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      // Use a system Chromium when Playwright's download isn't available.
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    },
    // Behind a corporate/sandbox proxy, send the preview traffic through it.
    proxy: proxy ? { server: proxy, bypass: "localhost,127.0.0.1" } : undefined,
  },
  webServer: {
    command: "node serve.mjs",
    url: `http://localhost:${HOST_PORT}/`,
    reuseExistingServer: false,
    stdout: "pipe",
  },
});
