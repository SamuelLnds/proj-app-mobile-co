// Aiguillage des modes du simulateur selon la configuration.
import type { Config } from "./config";
import type { DeviceClient } from "./device/run-device";
import { startEnrolledDevice } from "./device/run-enrolled-device";
import { startPanelsMode } from "./panels/run-panels";

/**
 * Démarre les modes ; renvoie la fonction qui les arrête.
 * Le mode panneaux tourne toujours, sur la connexion du simulateur ; le mode objet du site
 * seulement avec `SIMULATE_DEVICE`, sur sa propre connexion obtenue par enrôlement (#84).
 */
export function startSimulator(
  client: DeviceClient,
  config: Config,
  startDevice: (config: Config) => () => void = startEnrolledDevice,
): () => void {
  const stoppers: Array<() => void> = [
    startPanelsMode(client, {
      siteCode: config.SITE_CODE,
      faultyPanels: config.FAULTY_PANELS,
      extraPanels: config.EXTRA_PANELS,
    }),
  ];
  if (config.SIMULATE_DEVICE) {
    stoppers.push(startDevice(config));
  }
  return () => stoppers.forEach((stop) => stop());
}
