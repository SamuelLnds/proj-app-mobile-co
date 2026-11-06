import type { DataSource } from "./DataSource";
import { MockDataSource } from "./mock/MockDataSource";
import { parseScenario } from "./mock/scenarios";

export { DataSourceError, type DataSource } from "./DataSource";
export { MockDataSource } from "./mock/MockDataSource";
export { MOCK_SCENARIOS, type MockScenario } from "./mock/scenarios";

/**
 * Source de données active, choisie par EXPO_PUBLIC_DATA_SOURCE (D025).
 * - `mock` (défaut) : données d'exemple vivantes, scénario par EXPO_PUBLIC_MOCK_SCENARIO.
 * - `api` : appels à l'API REST. Pour la brancher (issue #25), écrire `ApiDataSource`
 *   (implémentation de `DataSource` avec fetch et EXPO_PUBLIC_API_URL) et la renvoyer ici :
 *   aucun écran ni hook n'est à modifier.
 */
function createDataSource(): DataSource {
  const kind = process.env.EXPO_PUBLIC_DATA_SOURCE ?? "mock";
  if (kind === "api") {
    console.warn(
      "[data] La source « api » n'existe pas encore (issue #25) : données d'exemple utilisées.",
    );
  }
  return new MockDataSource(parseScenario(process.env.EXPO_PUBLIC_MOCK_SCENARIO));
}

export const dataSource: DataSource = createDataSource();
