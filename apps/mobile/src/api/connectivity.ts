import { dataSource, MockDataSource } from "../data";

/**
 * Connexion réseau du téléphone. Avec la source `mock`, elle suit le scénario « Téléphone hors ligne » ;
 * l'issue #37 la remplacera par la détection réelle (@react-native-community/netinfo).
 */
export function useConnectivity(): { online: boolean } {
  const offline = dataSource instanceof MockDataSource && dataSource.scenario === "phone_offline";
  return { online: !offline };
}
