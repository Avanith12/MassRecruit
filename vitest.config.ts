import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/unit/global-setup.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "file:./test.db",
      AUTH_SECRET: "test-secret-test-secret-test-secret",
      ALLOWED_EMAIL_DOMAIN: "edu",
      ADMIN_EMAILS: "boss@umb.edu",
      RESEND_API_KEY: "",
    },
    fileParallelism: false, // integration tests share one SQLite file
    testTimeout: 60_000, // DB-backed property tests run many iterations
  },
});
