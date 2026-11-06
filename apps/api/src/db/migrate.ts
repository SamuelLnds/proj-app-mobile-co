// Applique les migrations (src/db/migrations) sur la base désignée par DATABASE_URL.
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadConfig } from "../config";
import { createDb } from "./client";

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);

try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) });
  console.log("Migrations appliquées.");
} finally {
  await pool.end();
}
