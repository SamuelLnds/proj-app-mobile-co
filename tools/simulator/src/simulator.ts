// Aiguillage des modes du simulateur selon la configuration.
import type { Config } from "./config";
import { startDeviceMode, type DeviceClient } from "./device/run-device";
import { startPanelsMode } from "./panels/run-panels";

/**
 * Démarre les modes ; renvoie la fonction qui les arrête.
 * Le mode panneaux tourne toujours ; le mode objet du site seulement avec `SIMULATE_DEVICE`.
 */
export function startSimulator(client: DeviceClient, config: Config): () => void {
  const stoppers: Array<() => void> = [
    startPanelsMode(client, {
      siteCode: config.SITE_CODE,
      faultyPanels: config.FAULTY_PANELS,
      extraPanels: config.EXTRA_PANELS,
    }),
  ];
  if (config.SIMULATE_DEVICE) {
    stoppers.push(startDeviceMode(client, config.SITE_CODE));
  }
  return () => stoppers.forEach((stop) => stop());
}
