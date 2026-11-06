// Connexion à PostgreSQL : seul point de création du pool et du client Drizzle.
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  // `casing` doit rester identique à celui de drizzle.config.ts.
  const db = drizzle(pool, { schema, casing: "snake_case" });
  return { pool, db };
}

export type Database = ReturnType<typeof createDb>;
