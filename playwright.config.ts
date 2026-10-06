import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  timeout: 90000,
  testDir: "tests",
  testMatch: "**/viewer.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4319",
    headless: true,
    viewport: { width: 1280, height: 850 },
    launchOptions: {
      args: [
        "--enable-webgl",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: "npm run demo",
    env: { PROJECTS_DIR: resolve(".jobs/ui-projects") },
    url: "http://127.0.0.1:4319",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  reporter: "list",
});
