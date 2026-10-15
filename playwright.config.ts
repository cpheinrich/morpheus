import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: { viewport: { width: 1280, height: 900 }, trace: "retain-on-failure" },
  timeout: 20_000,
});
