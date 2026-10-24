// Runs a real PostgreSQL server from npm (embedded-postgres) for local dev and tests,
// so no Docker or system install is needed. Production uses a managed Postgres instead.
import { existsSync } from "node:fs";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

export const PG_USER = "postgres";
export const PG_PASSWORD = "postgres"; // local-only; the server listens on localhost

export const pgUrl = (port, db) => `postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${port}/${db}`;

/**
 * Start Postgres on `port` with data in `dataDir`, creating `databases` if missing.
 * Returns { stop() }.
 */
export async function startPg({ port, dataDir, databases = [], persistent = true }) {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: PG_USER,
    password: PG_PASSWORD,
    port,
    persistent,
    onLog: () => {},
    onError: (e) => console.error("[postgres]", String(e).trim()),
  });
  if (!existsSync(join(dataDir, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  try {
    for (const db of databases) {
      const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
      if (!rowCount) await pg.createDatabase(db);
    }
  } finally {
    await client.end();
  }
  return { stop: () => pg.stop() };
}
