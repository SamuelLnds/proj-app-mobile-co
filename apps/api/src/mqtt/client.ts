// Client MQTT de l'API : connexion, reconnexion, abonnements (section 6.1 de la cartographie)
// et publication. Les identifiants ne sont jamais journalisés.
import { API_SUBSCRIPTIONS } from "@solar/contracts";
import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import type { FastifyBaseLogger } from "fastify";

/** Délai entre deux tentatives de reconnexion. */
const RECONNECT_PERIOD_MS = 5000;

export interface MqttSettings {
  url: string;
  username: string;
  password: string;
}

export interface PublishOptions {
  qos: 0 | 1;
  retain: boolean;
}

export interface ApiMqttClient {
  /** Vrai tant que la connexion au broker est établie. */
  isConnected: () => boolean;
  /** Publie un message JSON ; échoue si le broker ne l'accepte pas. */
  publish: (topic: string, message: unknown, options: PublishOptions) => Promise<void>;
  close: () => Promise<void>;
}

/** Fonction de connexion, remplaçable dans les tests. */
export type ConnectFn = (url: string, options: IClientOptions) => MqttClient;

export function createMqttClient(
  settings: MqttSettings,
  onMessage: (topic: string, payload: Buffer) => void,
  logger: FastifyBaseLogger,
  connect: ConnectFn = mqtt.connect,
): ApiMqttClient {
  const host = new URL(settings.url).host;
  const client = connect(settings.url, {
    username: settings.username,
    password: settings.password,
    clientId: "api",
    reconnectPeriod: RECONNECT_PERIOD_MS,
  });

  client.on("connect", () => {
    logger.info({ broker: host }, "Connecté au broker MQTT");
    // Réabonnement à chaque connexion : les messages retained (état, statut) sont alors relus.
    client.subscribe([...API_SUBSCRIPTIONS], { qos: 1 }, (error) => {
      if (error) logger.error({ err: error }, "Abonnement MQTT refusé");
      else logger.info({ topics: API_SUBSCRIPTIONS }, "Abonné aux topics de l'API");
    });
  });
  client.on("reconnect", () => logger.warn({ broker: host }, "Reconnexion au broker MQTT"));
  client.on("offline", () => logger.warn({ broker: host }, "Broker MQTT injoignable"));
  client.on("error", (error) => logger.error({ err: error }, "Erreur du client MQTT"));
  client.on("message", (topic, payload) => onMessage(topic, payload));

  return {
    isConnected: () => client.connected,
    publish: (topic, message, options) =>
      new Promise((resolve, reject) => {
        client.publish(topic, JSON.stringify(message), options, (error) =>
          error ? reject(error) : resolve(),
        );
      }),
    close: () => new Promise((resolve) => client.end(false, {}, () => resolve())),
  };
}
