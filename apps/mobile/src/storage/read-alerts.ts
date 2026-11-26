import { openDatabase, type LocalDatabase } from "./database";

/**
 * Alertes actives que l'utilisateur a marquées comme lues sur ce téléphone (D034). Cet état n'est
 * jamais envoyé à l'API : il ne contient que des identifiants d'alertes, et est effacé à la
 * déconnexion avec le reste des données locales.
 */

/** Stockage sous-jacent : SQLite (table `read_alerts`) dans l'app, mémoire dans les tests. */
export interface ReadAlertStore {
  /** Identifiants de toutes les alertes lues. */
  readAll: () => Promise<string[]>;
  /** Ajoute des alertes lues ; une alerte déjà lue garde sa date de lecture d'origine. */
  add: (ids: readonly string[], readAt: string) => Promise<void>;
  /** Retire des alertes (celles qui ne sont plus actives). */
  remove: (ids: readonly string[]) => Promise<void>;
  clear: () => Promise<void>;
}

/** Nombre maximal d'identifiants par requête SQL (limite du nombre de paramètres de SQLite). */
const CHUNK_SIZE = 100;

function chunks<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK_SIZE) result.push(items.slice(i, i + CHUNK_SIZE));
  return result;
}

export function createSqliteReadAlertStore(
  open: () => Promise<LocalDatabase> = openDatabase,
): ReadAlertStore {
  return {
    async readAll() {
      const db = await open();
      const rows = await db.getAllAsync<{ alert_id: string }>("SELECT alert_id FROM read_alerts");
      return rows.map((row) => row.alert_id);
    },
    async add(ids, readAt) {
      const db = await open();
      for (const chunk of chunks(ids)) {
        const values = chunk.map(() => "(?, ?)").join(", ");
        await db.runAsync(
          `INSERT OR IGNORE INTO read_alerts (alert_id, read_at) VALUES ${values}`,
          chunk.flatMap((id) => [id, readAt]),
        );
      }
    },
    async remove(ids) {
      const db = await open();
      for (const chunk of chunks(ids)) {
        const marks = chunk.map(() => "?").join(", ");
        await db.runAsync(`DELETE FROM read_alerts WHERE alert_id IN (${marks})`, chunk);
      }
    },
    async clear() {
      const db = await open();
      await db.runAsync("DELETE FROM read_alerts");
    },
  };
}

export function createMemoryReadAlertStore(): ReadAlertStore & { rows: Map<string, string> } {
  const rows = new Map<string, string>();
  return {
    rows,
    async readAll() {
      return [...rows.keys()];
    },
    async add(ids, readAt) {
      for (const id of ids) if (!rows.has(id)) rows.set(id, readAt);
    },
    async remove(ids) {
      for (const id of ids) rows.delete(id);
    },
    async clear() {
      rows.clear();
    },
  };
}

let store: ReadAlertStore = createSqliteReadAlertStore();

/** Remplace le stockage (tests). */
export function setReadAlertStore(next: ReadAlertStore): void {
  store = next;
}

/** Identifiants des alertes lues ; une erreur de stockage donne une liste vide (tout est non lu). */
export async function loadReadAlerts(): Promise<string[]> {
  try {
    return await store.readAll();
  } catch (error) {
    console.warn("[storage] Lecture des alertes lues impossible", error);
    return [];
  }
}

/** Enregistre des alertes comme lues ; une erreur de stockage n'empêche jamais l'affichage. */
export async function saveReadAlerts(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await store.add(ids, new Date().toISOString());
  } catch (error) {
    console.warn("[storage] Alertes lues non enregistrées", error);
  }
}

/** Retire de la mémoire locale les alertes qui ne sont plus actives. */
export async function removeReadAlerts(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await store.remove(ids);
  } catch (error) {
    console.warn("[storage] Purge des alertes lues impossible", error);
  }
}

/** Efface les alertes lues (déconnexion). */
export async function clearReadAlerts(): Promise<void> {
  try {
    await store.clear();
  } catch (error) {
    console.warn("[storage] Effacement des alertes lues impossible", error);
  }
}
