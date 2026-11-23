import { useNetInfo } from "@react-native-community/netinfo";

import { dataSource, MockDataSource } from "../data";

/**
 * Connexion réseau du téléphone (@react-native-community/netinfo). Avec la source `mock`, le
 * scénario « Téléphone hors ligne » la simule. Tant que l'état est inconnu, le téléphone est
 * considéré comme connecté.
 */
export function useConnectivity(): { online: boolean } {
  const { isConnected } = useNetInfo();
  const simulatedOffline =
    dataSource instanceof MockDataSource && dataSource.scenario === "phone_offline";
  return { online: !simulatedOffline && isConnected !== false };
}
