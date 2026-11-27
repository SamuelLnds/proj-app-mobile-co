// Connexion du simulateur au broker MQTT (écoute locale, mesures des panneaux). Les mots de passe
// ne sont jamais affichés. En mode objet du site, l'objet a sa propre connexion, par certificat
// (device/run-enrolled-device.ts).
import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import type { Config } from "./config";

/** Délai avant une nouvelle tentative de connexion après une coupure. */
const RECONNECT_PERIOD_MS = 5000;

/**
 * Options de la connexion des panneaux : identifiant et mot de passe du simulateur. Pas de Last
 * Will : celui de l'objet est porté par sa propre connexion.
 */
export function buildConnectOptions(config: Config): IClientOptions {
  return {
    username: config.MQTT_USERNAME,
    password: config.MQTT_PASSWORD,
    clientId: `simulator-${config.SITE_CODE.toLowerCase()}`,
    reconnectPeriod: RECONNECT_PERIOD_MS,
  };
}

/** Ouvre la connexion au broker et affiche dans la console le résultat (connexion ou erreur). */
export function connectToBroker(config: Config): MqttClient {
  // Seul l'hôte est affiché : l'URL ne contient pas de secret, mais on évite d'afficher le chemin complet.
  const brokerHost = new URL(config.MQTT_URL).host;

  const client = mqtt.connect(config.MQTT_URL, buildConnectOptions(config));

  client.on("connect", () => {
    console.log(`[simulator] Connecté au broker MQTT ${brokerHost} (site ${config.SITE_CODE})`);
  });

  client.on("error", (error) => {
    console.error(
      `[simulator] Erreur de connexion au broker MQTT ${brokerHost} : ${error.message}`,
    );
  });

  return client;
}
