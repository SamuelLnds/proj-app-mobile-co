// Aiguillage des messages MQTT reçus : analyse du topic, validation par le schéma de
// @solar/contracts, puis appel du service concerné. Un message invalide est journalisé en
// avertissement et ignoré ; il n'arrête jamais l'API.
import {
  ControlStateSchema,
  DeviceStatusSchema,
  PanelMeasurementSchema,
  parseTopic,
  SiteMeasurementSchema,
  type ControlState,
  type DeviceStatus,
  type PanelMeasurement,
  type SiteMeasurement,
} from "@solar/contracts";
import type { FastifyBaseLogger } from "fastify";
import type { z } from "zod";

/** Services appelés pour chaque type de message ; un service absent n'est pas encore réalisé. */
export interface MessageServices {
  siteMeasurement?: (siteCode: string, message: SiteMeasurement, receivedAt: Date) => Promise<void>;
  panelMeasurement?: (
    siteCode: string,
    panelCode: string,
    message: PanelMeasurement,
    receivedAt: Date,
  ) => Promise<void>;
  controlState?: (siteCode: string, message: ControlState, receivedAt: Date) => Promise<void>;
  deviceStatus?: (siteCode: string, message: DeviceStatus, receivedAt: Date) => Promise<void>;
}

export type MessageHandler = (topic: string, payload: Buffer) => Promise<void>;

export function createMessageHandler(
  services: MessageServices,
  logger: FastifyBaseLogger,
  now: () => Date = () => new Date(),
): MessageHandler {
  return async (topic, payload) => {
    const receivedAt = now();
    const parsedTopic = parseTopic(topic);
    if (!parsedTopic.ok) {
      logger.warn({ topic }, `Message MQTT ignoré : ${parsedTopic.error}`);
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(payload.toString("utf8"));
    } catch {
      logger.warn({ topic }, "Message MQTT ignoré : JSON illisible");
      return;
    }

    const validate = <T>(schema: z.ZodType<T>): T | null => {
      const result = schema.safeParse(json);
      if (result.success) return result.data;
      logger.warn(
        { topic, issues: result.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`) },
        "Message MQTT ignoré : format invalide",
      );
      return null;
    };

    const { siteCode } = parsedTopic;
    try {
      switch (parsedTopic.kind) {
        case "site-measurements": {
          const message = validate(SiteMeasurementSchema);
          if (message) await services.siteMeasurement?.(siteCode, message, receivedAt);
          break;
        }
        case "panel-measurements": {
          const message = validate(PanelMeasurementSchema);
          if (message)
            await services.panelMeasurement?.(siteCode, parsedTopic.panelCode, message, receivedAt);
          break;
        }
        case "state": {
          const message = validate(ControlStateSchema);
          if (message) await services.controlState?.(siteCode, message, receivedAt);
          break;
        }
        case "status": {
          const message = validate(DeviceStatusSchema);
          if (message) await services.deviceStatus?.(siteCode, message, receivedAt);
          break;
        }
        case "setpoint":
          // Publié par l'API elle-même : rien à traiter.
          break;
      }
    } catch (error) {
      logger.error({ err: error, topic }, "Erreur pendant le traitement d'un message MQTT");
    }
  };
}
