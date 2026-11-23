// Aiguillage des modes du simulateur selon la configuration.
import type { Config } from "./config";
import { startDeviceMode, type DeviceClient } from "./device/run-device";

/** Démarre les modes activés ; renvoie la fonction qui les arrête. Les mesures des panneaux relèvent de #30. */
export function startSimulator(client: DeviceClient, config: Config): () => void {
  const stoppers: Array<() => void> = [];
  if (config.SIMULATE_DEVICE) {
    stoppers.push(startDeviceMode(client, config.SITE_CODE));
  }
  return () => stoppers.forEach((stop) => stop());
}
