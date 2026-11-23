import * as SQLite from "expo-sqlite";

/**
 * Dernière réponse reçue pour chaque ressource (D014) : l'app l'affiche au démarrage ou sans
 * réseau. Seules des données de l'API y sont écrites, jamais le jeton (il est dans
 * expo-secure-store).
 */
export interface StoredResponse<T> {
  value: T;
  /** Date d'enregistrement, ISO 8601. */
  savedAt: string;
}

/** Stockage clé-valeur sous-jacent : SQLite dans l'app, mémoire dans les tests. */
export interface ResponseStore {
  write: (key: string, body: string, savedAt: string) => Promise<void>;
  read: (key: string) => Promise<{ body: string; savedAt: string } | null>;
  clear: () => Promise<void>;
}

export function createSqliteStore(name = "solar.db"): ResponseStore {
  let database: Promise<SQLite.SQLiteDatabase> | null = null;
  const open = () =>
    (database ??= SQLite.openDatabaseAsync(name).then(async (db) => {
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS responses (
          key TEXT PRIMARY KEY NOT NULL,
          body TEXT NOT NULL,
          saved_at TEXT NOT NULL
        )`,
      );
      return db;
    }));

  return {
    async write(key, body, savedAt) {
      const db = await open();
      await db.runAsync(
        "INSERT OR REPLACE INTO responses (key, body, saved_at) VALUES (?, ?, ?)",
        key,
        body,
        savedAt,
      );
    },
    async read(key) {
      const db = await open();
      const row = await db.getFirstAsync<{ body: string; saved_at: string }>(
        "SELECT body, saved_at FROM responses WHERE key = ?",
        key,
      );
      return row ? { body: row.body, savedAt: row.saved_at } : null;
    },
    async clear() {
      const db = await open();
      await db.runAsync("DELETE FROM responses");
    },
  };
}

export function createMemoryStore(): ResponseStore & { rows: Map<string, string> } {
  const rows = new Map<string, string>();
  const dates = new Map<string, string>();
  return {
    rows,
    async write(key, body, savedAt) {
      rows.set(key, body);
      dates.set(key, savedAt);
    },
    async read(key) {
      const body = rows.get(key);
      return body === undefined ? null : { body, savedAt: dates.get(key)! };
    },
    async clear() {
      rows.clear();
      dates.clear();
    },
  };
}

let store: ResponseStore = createSqliteStore();

/** Remplace le stockage (tests). */
export function setResponseStore(next: ResponseStore): void {
  store = next;
}

/** Enregistre une réponse ; une erreur de stockage n'empêche jamais l'affichage. */
export async function saveResponse(key: string, value: unknown): Promise<void> {
  try {
    await store.write(key, JSON.stringify(value), new Date().toISOString());
  } catch (error) {
    console.warn("[storage] Réponse non enregistrée", error);
  }
}

export async function readResponse<T>(key: string): Promise<StoredResponse<T> | null> {
  try {
    const row = await store.read(key);
    return row ? { value: JSON.parse(row.body) as T, savedAt: row.savedAt } : null;
  } catch (error) {
    console.warn("[storage] Lecture impossible", error);
    return null;
  }
}

/** Vide le stockage local (déconnexion : les données d'un compte ne restent pas sur le téléphone). */
export async function clearResponses(): Promise<void> {
  try {
    await store.clear();
  } catch (error) {
    console.warn("[storage] Effacement impossible", error);
  }
}
