import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://localhost:3004";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",

  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
    video: "off",
  },

  webServer: {
    command:
      "npm run build && npm run start -- --hostname 127.0.0.1 --port 3004",
    url: `${baseURL}/sign-in`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",

    env: {
      NEXT_BUILD_DIR: ".next-e2e",
      E2E_AUTH_RATE_LIMIT: "1",
      AUTH_DATABASE_URL:
        "postgresql://metering_e2e:e2e_local_password_not_for_production@127.0.0.1:5434/usage_metering_e2e",
      BETTER_AUTH_SECRET:
        "e2e-only-auth-secret-not-for-production-2026",
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_TRUSTED_ORIGINS: baseURL,
      METERING_API_URL: "http://127.0.0.1:3003",
      METERING_ADMIN_API_KEY:
        "e2e_local_admin_key_not_for_production",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
