import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error — plain .mjs helper without type declarations
import { pgUrl, startPg } from "../../scripts/embedded-pg.mjs";

export const TEST_PG_PORT = 5434;
export const TEST_DB_URL = pgUrl(TEST_PG_PORT, "massrecruit_test");

/** Throwaway Postgres for the unit/integration run; never touches the dev database. */
export default async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "mr-pg-test-"));
  const pg = await startPg({ port: TEST_PG_PORT, dataDir: dir, databases: ["massrecruit_test"], persistent: false });
  execSync("npx prisma db push --force-reset --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: TEST_DB_URL, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" },
  });
  return async () => {
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}
