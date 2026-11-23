// Point d'entrée du simulateur : valide la configuration puis se connecte au broker MQTT.
import { loadConfig } from "./config";
import { connectToBroker } from "./mqtt-client";
import { startSimulator } from "./simulator";

function main(): void {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const client = connectToBroker(config);
  const stopSimulator = startSimulator(client, config);

  // Arrêt propre : arrêter les minuteries puis fermer la connexion MQTT avant de quitter le processus.
  const shutdown = (): void => {
    stopSimulator();
    client.end(true, () => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
