// Entrées-sorties du mode objet du site : publication du statut, des mesures et de l'état, lecture des consignes.
import {
  MESSAGE_VERSION,
  SITE_MEASUREMENT_PERIOD_S,
  SetpointSchema,
  setpointTopic,
  siteMeasurementsTopic,
  stateTopic,
  statusTopic,
  type ControlState,
  type DeviceStatus,
} from "@solar/contracts";
import type { MqttClient } from "mqtt";
import { SiteDevice } from "./site-device";

/** Version du firmware simulée, annoncée avec `online`. */
export const SIMULATED_FIRMWARE_VERSION = "simulator";
/** Période du tick de l'algorithme (s), comme l'ESP32. */
export const DEVICE_TICK_PERIOD_S = 1;

/** Le client MQTT réduit à ce dont le mode objet a besoin (facilite les tests). */
export type DeviceClient = Pick<MqttClient, "publish" | "subscribe" | "on" | "connected">;

/** Options de publication de `status` et `state` : retained, QoS 1. */
const RETAINED_QOS1 = { qos: 1, retain: true } as const;

/** Démarre le mode objet ; renvoie la fonction d'arrêt de la minuterie. */
export function startDeviceMode(
  client: DeviceClient,
  siteCode: string,
  now: () => Date = () => new Date(),
): () => void {
  const device = new SiteDevice();
  const topics = {
    status: statusTopic(siteCode),
    measurements: siteMeasurementsTopic(siteCode),
    setpoint: setpointTopic(siteCode),
    state: stateTopic(siteCode),
  };

  const publishState = (state: ControlState): void => {
    client.publish(topics.state, JSON.stringify(state), RETAINED_QOS1);
  };

  // À chaque (re)connexion : annonce en ligne, abonnement aux consignes, état courant.
  client.on("connect", () => {
    const online: DeviceStatus = {
      v: MESSAGE_VERSION,
      status: "online",
      firmwareVersion: SIMULATED_FIRMWARE_VERSION,
    };
    client.publish(topics.status, JSON.stringify(online), RETAINED_QOS1);
    client.subscribe(topics.setpoint, { qos: 1 });
    publishState(device.controlState(now()));
  });

  client.on("message", (topic, payload) => {
    if (topic !== topics.setpoint) return;
    let json: unknown;
    try {
      json = JSON.parse(payload.toString());
    } catch {
      console.warn("[simulator] Consigne ignorée : JSON invalide");
      return;
    }
    const parsed = SetpointSchema.safeParse(json);
    if (!parsed.success) {
      console.warn(
        `[simulator] Consigne ignorée : ${parsed.error.issues[0]?.message ?? "format invalide"}`,
      );
      return;
    }
    publishState(device.receiveSetpoint(parsed.data, now()));
  });

  let ticks = 0;
  const ticksPerMeasurement = SITE_MEASUREMENT_PERIOD_S / DEVICE_TICK_PERIOD_S;
  const timer = setInterval(() => {
    if (!client.connected) return;
    const changed = device.tick(DEVICE_TICK_PERIOD_S, now());
    if (changed) publishState(changed);
    ticks += 1;
    if (ticks % ticksPerMeasurement === 0) {
      client.publish(topics.measurements, JSON.stringify(device.measurement(now())), { qos: 0 });
    }
  }, DEVICE_TICK_PERIOD_S * 1000);

  return () => clearInterval(timer);
}
