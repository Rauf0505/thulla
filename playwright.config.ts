import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  use: {
    baseURL: process.env.TEST_URL || "http://localhost:3001",
    headless: true,
  },
  workers: 1,
});
