import { defineConfig } from "@playwright/test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dataDir = mkdtempSync(join(tmpdir(), "stunnel-cp-e2e-"));
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (!process.env.CI && existsSync("/usr/bin/google-chrome")
    ? "/usr/bin/google-chrome"
    : undefined);
export default defineConfig({
  testDir: "./tests",
  timeout: 45000,
  workers: 1,
  fullyParallel: false,
  globalTeardown: "./tests/teardown.mjs",
  metadata: { dataDir },
  use: {
    baseURL: "http://127.0.0.1:18080",
    headless: true,
    viewport: { width: 1440, height: 1100 },
    launchOptions: { executablePath },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "go run ../cmd/stunnel-cp serve",
    url: "http://127.0.0.1:18080/healthz",
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      STCP_ADDR: "127.0.0.1:18080",
      STCP_DATA_DIR: dataDir,
      STCP_SECURE_COOKIE: "false",
    },
  },
});
