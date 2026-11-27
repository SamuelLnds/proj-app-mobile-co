// Entrées-sorties du mode panneaux : lecture de l'ensoleillement du site, publication des mesures.
// Ce mode tourne toujours, que le simulateur joue l'objet du site ou non.
import {
  PANEL_MEASUREMENT_PERIOD_S,
  SiteMeasurementSchema,
  panelMeasurementsTopic,
  siteMeasurementsTopic,
} from "@solar/contracts";
import type { MqttClient } from "mqtt";
import { buildPanelMeasurement, panelCodesToPublish } from "./panel-measurement";

/** Le client MQTT réduit à ce dont le mode panneaux a besoin (facilite les tests). */
export type PanelsClient = Pick<MqttClient, "publish" | "subscribe" | "on" | "connected">;

export type PanelsOptions = {
  siteCode: string;
  faultyPanels: readonly string[];
  extraPanels: readonly string[];
};

/**
 * Démarre le mode panneaux ; renvoie la fonction d'arrêt de la minuterie.
 *
 * L'ensoleillement vient toujours de la dernière mesure du site reçue sur le broker, y compris
 * en mode objet du site (le simulateur reçoit alors ses propres mesures) : un seul chemin,
 * identique à celui de l'API. Tant qu'aucune mesure n'a été reçue, rien n'est publié : publier
 * 0 W fausserait l'alerte de production faible, alors que l'absence de message donne `no_data`.
 */
export function startPanelsMode(
  client: PanelsClient,
  options: PanelsOptions,
  now: () => Date = () => new Date(),
  random: () => number = Math.random,
): () => void {
  const siteTopic = siteMeasurementsTopic(options.siteCode);
  const codes = panelCodesToPublish(options.extraPanels);
  const faulty = new Set(options.faultyPanels);
  let irradiance: number | null = null;

  // À chaque (re)connexion : abonnement (la session ne conserve pas les abonnements).
  client.on("connect", () => {
    client.subscribe(siteTopic, { qos: 0 });
  });

  client.on("message", (topic, payload) => {
    if (topic !== siteTopic) return;
    let json: unknown;
    try {
      json = JSON.parse(payload.toString());
    } catch {
      console.warn("[simulator] Mesure du site ignorée : JSON invalide");
      return;
    }
    const parsed = SiteMeasurementSchema.safeParse(json);
    if (!parsed.success) {
      console.warn(
        `[simulator] Mesure du site ignorée : ${parsed.error.issues[0]?.message ?? "format invalide"}`,
      );
      return;
    }
    irradiance = parsed.data.irradiance;
  });

  const timer = setInterval(() => {
    if (!client.connected || irradiance === null) return;
    const date = now();
    for (const code of codes) {
      const measurement = buildPanelMeasurement({
        irradiance,
        faulty: faulty.has(code),
        random: random(),
        now: date,
      });
      client.publish(panelMeasurementsTopic(options.siteCode, code), JSON.stringify(measurement), {
        qos: 0,
      });
    }
  }, PANEL_MEASUREMENT_PERIOD_S * 1000);

  return () => clearInterval(timer);
}
