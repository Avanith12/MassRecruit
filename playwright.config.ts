import { defineConfig } from "@playwright/test";

const PORT = 3100;
// Isolated DB for E2E (prisma/e2e.db) so dev data is never touched.
const env = {
  DATABASE_URL: "file:./e2e.db",
  CRON_SECRET: "e2e-cron-secret",
  ADMIN_EMAILS: "admin@umb.edu",
  RESEND_API_KEY: "",
  PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes", // allows --force-reset of the throwaway e2e DB
};

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1, // tests share one database
  fullyParallel: false,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? "chrome", // system Chrome; set PW_CHANNEL="" to use bundled Chromium
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    // Reset + seed the e2e DB, build, then serve the production bundle.
    command: [
      "npx prisma db push --force-reset --skip-generate",
      "npx tsx prisma/seed.ts",
      "npx next build",
      `npx next start -p ${PORT}`,
    ].join(" && "),
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: false,
    env,
  },
});
