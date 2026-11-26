import { clearReadAlerts } from "./read-alerts";
import { clearResponses } from "./responses";

export {
  clearResponses,
  createMemoryStore,
  readResponse,
  saveResponse,
  setResponseStore,
  type ResponseStore,
  type StoredResponse,
} from "./responses";
export {
  clearReadAlerts,
  createMemoryReadAlertStore,
  createSqliteReadAlertStore,
  loadReadAlerts,
  removeReadAlerts,
  saveReadAlerts,
  setReadAlertStore,
  type ReadAlertStore,
} from "./read-alerts";
export { createDatabaseOpener, openDatabase, type LocalDatabase } from "./database";

/**
 * Vide toutes les données locales : dernières réponses de l'API et alertes lues. Appelée à la
 * déconnexion : les données d'un compte ne restent pas sur le téléphone.
 */
export async function clearLocalData(): Promise<void> {
  await Promise.all([clearResponses(), clearReadAlerts()]);
}
