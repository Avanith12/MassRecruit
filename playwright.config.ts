import { defineConfig } from "@playwright/test";

const PORT = 3100;
// Isolated throwaway Postgres for E2E (started by scripts/e2e-server.mjs).
const env = {
  CRON_SECRET: "e2e-cron-secret",
  ADMIN_EMAILS: "admin@umb.edu",
  RESEND_API_KEY: "",
  BLOB_READ_WRITE_TOKEN: "",
  UPLOAD_DIR: "./test-results/uploads", // throwaway local storage for consent PDFs
  E2E_PORT: String(PORT),
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
    // Throwaway Postgres → schema → seed → production build → next start.
    command: "node scripts/e2e-server.mjs",
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: false,
    env,
  },
});
