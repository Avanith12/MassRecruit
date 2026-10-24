// Local development database: `npm run db:start` (leave it running), then in another
// terminal `npx prisma migrate dev && npx prisma db seed && npm run dev`.
import { join } from "node:path";
import { pgUrl, startPg } from "./embedded-pg.mjs";

const PORT = Number(process.env.DEV_PG_PORT || 5433);
const pg = await startPg({ port: PORT, dataDir: join(process.cwd(), ".pgdata"), databases: ["massrecruit"] });
console.log(`Postgres ready → DATABASE_URL="${pgUrl(PORT, "massrecruit")}"  (Ctrl+C to stop)`);

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30); // keep alive
