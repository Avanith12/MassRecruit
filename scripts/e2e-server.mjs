// E2E server: throwaway Postgres → schema → seed → production build → `next start`.
// Used by playwright.config.ts as the webServer command. Stops Postgres on exit.
import { execSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pgUrl, startPg } from "./embedded-pg.mjs";

const PG_PORT = 5435;
const APP_PORT = process.env.E2E_PORT || "3100";
const dir = mkdtempSync(join(tmpdir(), "mr-pg-e2e-"));
const pg = await startPg({ port: PG_PORT, dataDir: dir, databases: ["massrecruit_e2e"], persistent: false });
const env = { ...process.env, DATABASE_URL: pgUrl(PG_PORT, "massrecruit_e2e"), PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" };

let app;
const cleanup = async () => {
  app?.kill("SIGTERM");
  await pg.stop().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

try {
  const run = (cmd) => execSync(cmd, { stdio: "inherit", env });
  run("npx prisma db push --force-reset --skip-generate");
  run("npx tsx prisma/seed.ts");
  run("npx next build");
  app = spawn("npx", ["next", "start", "-p", APP_PORT], { stdio: "inherit", env });
  app.on("exit", cleanup);
} catch (e) {
  console.error(e);
  await cleanup();
}
