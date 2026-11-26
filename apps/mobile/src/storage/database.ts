import * as SQLite from "expo-sqlite";

/** Base SQLite locale de l'app (D014). Toutes les tables locales y sont créées à l'ouverture. */
export type LocalDatabase = SQLite.SQLiteDatabase;

/** Nom du fichier de la base locale. */
export const DATABASE_NAME = "solar.db";

/**
 * Retourne une fonction qui ouvre la base à la première demande, puis la réutilise : les
 * tables `responses` et `read_alerts` partagent la même connexion.
 */
export function createDatabaseOpener(name = DATABASE_NAME): () => Promise<LocalDatabase> {
  let database: Promise<LocalDatabase> | null = null;
  return () =>
    (database ??= SQLite.openDatabaseAsync(name).then(async (db) => {
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS responses (
          key TEXT PRIMARY KEY NOT NULL,
          body TEXT NOT NULL,
          saved_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS read_alerts (
          alert_id TEXT PRIMARY KEY NOT NULL,
          read_at TEXT NOT NULL
        );`,
      );
      return db;
    }));
}

/** Ouverture de la base de l'app. */
export const openDatabase = createDatabaseOpener();
