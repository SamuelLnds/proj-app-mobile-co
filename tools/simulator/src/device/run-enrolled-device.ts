// Mode objet du site avec enrôlement (#84, D027) : l'objet simulé obtient son certificat auprès
// de l'API, puis se connecte au broker en TLS mutuel sur 8883, sans mot de passe. Si son
// certificat est révoqué, refusé ou expiré, il recommence avec une nouvelle clé.
import { readFileSync } from "node:fs";
import {
  DEVICE_LAST_WILL,
  ENROLLMENT_POLL_PERIOD_S,
  EnrollmentStatusResponseSchema,
  statusTopic,
} from "@solar/contracts";
import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import type { Config } from "../config";
import { enroll, type EnrollmentDeps } from "./enrollment";
import { createIdentity, type DeviceIdentity } from "./identity";
import { startDeviceMode, type DeviceClient } from "./run-device";

/** Période de contrôle du certificat une fois connecté : une révocation ne coupe pas la connexion. */
export const CERTIFICATE_CHECK_PERIOD_MS = 10 * ENROLLMENT_POLL_PERIOD_S * 1000;
/** Délai avant de se reconnecter après une coupure. */
const RECONNECT_PERIOD_MS = 5000;

export type EnrolledDeviceClient = DeviceClient & Pick<MqttClient, "end">;

export interface EnrolledDeviceDeps {
  connect: (url: string, options: IClientOptions) => EnrolledDeviceClient;
  fetch: typeof fetch;
  log: (message: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  readCa: (path: string) => string;
}

const defaultDeps: EnrolledDeviceDeps = {
  connect: (url, options) => mqtt.connect(url, options),
  fetch: (...args) => fetch(...args),
  log: (message) => console.log(`[simulator] ${message}`),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
  readCa: (path) => readFileSync(path, "utf8"),
};

/**
 * Connexion de l'objet : certificat et clé de l'enrôlement, autorité du serveur, identifiant MQTT
 * égal au nom commun, Last Will `offline`. Aucun identifiant ni mot de passe.
 */
export function buildDeviceConnectOptions(
  config: Config,
  identity: DeviceIdentity,
  certificatePem: string,
  ca: string,
): IClientOptions {
  return {
    clientId: config.DEVICE_NAME,
    key: identity.privateKeyPem,
    cert: certificatePem,
    ca,
    rejectUnauthorized: true,
    reconnectPeriod: RECONNECT_PERIOD_MS,
    will: {
      topic: statusTopic(config.SITE_CODE),
      payload: Buffer.from(JSON.stringify(DEVICE_LAST_WILL)),
      qos: 1,
      retain: true,
    },
  };
}

/** Démarre le cycle enrôlement, connexion, contrôle du certificat ; renvoie la fonction d'arrêt. */
export function startEnrolledDevice(
  config: Config,
  overrides: Partial<EnrolledDeviceDeps> = {},
): () => void {
  const deps = { ...defaultDeps, ...overrides };
  let stopped = false;
  let current: { client: EnrolledDeviceClient; stopMode: () => void } | null = null;
  const enrollmentDeps: EnrollmentDeps = {
    apiUrl: config.API_URL,
    fetch: deps.fetch,
    log: deps.log,
    sleep: deps.sleep,
    stopped: () => stopped,
  };
  const disconnect = () => {
    current?.stopMode();
    current?.client.end(true);
    current = null;
  };

  /** Attend que le certificat ne soit plus utilisable (révoqué, expiré) ou l'arrêt du simulateur. */
  async function whileCertificateValid(
    fingerprint: string,
    expiresAt: Date,
  ): Promise<string | null> {
    for (;;) {
      await deps.sleep(CERTIFICATE_CHECK_PERIOD_MS);
      if (stopped) return null;
      if (deps.now() >= expiresAt) return "Certificat expiré";
      try {
        const response = await deps.fetch(
          `${config.API_URL.replace(/\/$/, "")}/enrollments/${fingerprint}`,
          { headers: { Accept: "application/json" } },
        );
        if (!response.ok) continue;
        const { status } = EnrollmentStatusResponseSchema.parse(await response.json());
        if (status === "revoked") return "Certificat révoqué par un exploitant";
        if (status !== "active") return `Certificat ${status}`;
      } catch {
        // API momentanément injoignable : le certificat reste utilisé.
      }
    }
  }

  async function run() {
    while (!stopped) {
      const identity = await createIdentity(config.DEVICE_NAME);
      const issued = await enroll(config.DEVICE_NAME, identity, enrollmentDeps);
      if (!issued) {
        if (!stopped) await deps.sleep(ENROLLMENT_POLL_PERIOD_S * 1000);
        continue;
      }
      const client = deps.connect(
        config.DEVICE_MQTT_URL,
        buildDeviceConnectOptions(
          config,
          identity,
          issued.certificatePem,
          deps.readCa(config.BROKER_CA_PATH),
        ),
      );
      // Le mode objet s'abonne aux événements avant la connexion effective.
      current = { client, stopMode: startDeviceMode(client, config.SITE_CODE, deps.now) };
      client.on("connect", () =>
        deps.log(
          `Objet ${config.DEVICE_NAME} connecté au broker en TLS mutuel (certificat client).`,
        ),
      );
      client.on("error", (error: Error) =>
        deps.log(`Connexion de l'objet au broker refusée : ${error.message}`),
      );
      const reason = await whileCertificateValid(identity.fingerprint, issued.expiresAt);
      disconnect();
      if (reason) deps.log(`${reason} : nouvel enrôlement avec une nouvelle clé.`);
    }
  }

  void run().catch((error: unknown) => {
    deps.log(`Erreur de l'enrôlement : ${error instanceof Error ? error.message : String(error)}`);
  });
  return () => {
    stopped = true;
    disconnect();
  };
}
