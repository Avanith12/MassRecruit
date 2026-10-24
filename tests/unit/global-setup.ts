import { execSync } from "node:child_process";

// Fresh schema in prisma/test.db before the run (never touches dev.db).
export default function setup() {
  execSync("npx prisma db push --force-reset --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: "file:./test.db", PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" },
  });
}
