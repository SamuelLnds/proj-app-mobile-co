import { ApiDataSource } from "./api/ApiDataSource";
import type { DataSource } from "./DataSource";
import { MockDataSource } from "./mock/MockDataSource";
import { parseScenario } from "./mock/scenarios";

export { ApiDataSource } from "./api/ApiDataSource";
export { DataSourceError, type DataSource } from "./DataSource";
export { MockDataSource } from "./mock/MockDataSource";
export { MOCK_SCENARIOS, type MockScenario } from "./mock/scenarios";

/** URL de l'API quand EXPO_PUBLIC_API_URL est absente (téléphone relié par `adb reverse`). */
const DEFAULT_API_URL = "http://localhost:3000/v1";

/**
 * Source de données active, choisie par EXPO_PUBLIC_DATA_SOURCE (D025).
 * - `mock` (défaut) : données d'exemple vivantes, scénario par EXPO_PUBLIC_MOCK_SCENARIO.
 * - `api` : appels à l'API REST à l'adresse EXPO_PUBLIC_API_URL.
 */
function createDataSource(): DataSource {
  if (process.env.EXPO_PUBLIC_DATA_SOURCE === "api") {
    return new ApiDataSource(process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL);
  }
  return new MockDataSource(parseScenario(process.env.EXPO_PUBLIC_MOCK_SCENARIO));
}

export const dataSource: DataSource = createDataSource();
