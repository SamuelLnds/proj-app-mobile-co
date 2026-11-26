// Enregistrement des mesures du site (séquence 4.2 de l'UML).
import { MAX_CLOCK_DRIFT_S, type SiteMeasurement } from "@solar/contracts";
import type { FastifyBaseLogger } from "fastify";
import type { MeasurementsRepository } from "./repository";

export interface MeasurementsService {
  recordSiteMeasurement: (
    siteCode: string,
    message: SiteMeasurement,
    receivedAt: Date,
  ) => Promise<void>;
}

/**
 * Horodatage retenu : celui de l'objet, sauf s'il s'écarte de plus de `MAX_CLOCK_DRIFT_S`
 * de l'heure de réception (horloge de l'objet déréglée) ; l'heure de réception le remplace alors.
 */
export function measurementTime(timestamp: string, receivedAt: Date): Date {
  const sent = new Date(timestamp);
  const driftS = Math.abs(sent.getTime() - receivedAt.getTime()) / 1000;
  return driftS > MAX_CLOCK_DRIFT_S ? receivedAt : sent;
}

export function createMeasurementsService(
  repository: MeasurementsRepository,
  logger: FastifyBaseLogger,
  /** Signe de vie de l'objet du site (suivi de son statut, #29). */
  recordDeviceActivity: (siteId: string, receivedAt: Date) => Promise<void> = async () => {},
): MeasurementsService {
  return {
    async recordSiteMeasurement(siteCode, message, receivedAt) {
      const siteId = await repository.findSiteIdByCode(siteCode);
      if (!siteId) {
        logger.warn({ siteCode }, "Mesure ignorée : code de site inconnu");
        return;
      }

      const time = measurementTime(message.timestamp, receivedAt);
      if (time === receivedAt) {
        logger.warn(
          { siteCode, timestamp: message.timestamp },
          "Horloge de l'objet décalée : heure de réception utilisée",
        );
      }

      await repository.insertSiteMeasurement({
        time,
        siteId,
        irradianceWM2: message.irradiance,
        productionW: message.production,
        temperatureC: message.temperature,
        batteryLevelPct: message.batteryLevel,
        batteryPowerW: message.batteryPower,
        gridPowerW: message.gridPower,
        mode: message.mode,
        simulatedFault: message.simulatedFault,
      });
      await recordDeviceActivity(siteId, receivedAt);
    },
  };
}
