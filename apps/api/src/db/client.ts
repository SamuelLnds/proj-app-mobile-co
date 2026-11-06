// Connexion à PostgreSQL : seul point de création du pool et du client Drizzle.
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  return { pool, db };
}

export type Database = ReturnType<typeof createDb>;
