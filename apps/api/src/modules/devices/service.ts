// Suivi du statut des objets (séquence 4.4 et diagramme 5.2 de l'UML).
import { DEVICE_SILENCE_TIMEOUT_S, type DeviceStatus } from "@solar/contracts";
import type { FastifyBaseLogger } from "fastify";
import type { DeviceRow, DevicesRepository } from "./repository";
import { nextDeviceStatus } from "./status";

export interface DevicesService {
  /** Message du topic `status` (connexion de l'objet ou Last Will). */
  recordStatus: (siteCode: string, message: DeviceStatus, receivedAt: Date) => Promise<void>;
  /** Tout autre message reçu de l'objet du site : il est en ligne. */
  recordActivity: (siteId: string, receivedAt: Date) => Promise<void>;
  /** Idem, pour un message dont on ne connaît que le code du site (état appliqué). */
  recordActivityForSiteCode: (siteCode: string, receivedAt: Date) => Promise<void>;
  /** Passe hors ligne les objets silencieux ; renvoie ceux qui ont changé (planificateur). */
  checkSilence: (now: Date) => Promise<DeviceRow[]>;
}

/** Alertes liées au statut de l'objet, ouvertes et résolues par le moteur d'alertes. */
export interface DeviceAlerts {
  deviceOffline: (siteId: string) => Promise<void>;
  deviceOnline: (siteId: string, at: Date) => Promise<void>;
}

export function createDevicesService(
  repository: DevicesRepository,
  logger: FastifyBaseLogger,
  alerts: DeviceAlerts = { deviceOffline: async () => {}, deviceOnline: async () => {} },
): DevicesService {
  async function markSeen(device: DeviceRow | null, receivedAt: Date) {
    if (!device) return;
    const previous = device.status;
    await repository.update(device.id, {
      status: nextDeviceStatus(device.status, "message"),
      lastSeenAt: receivedAt,
    });
    // Seul un objet qui n'était pas en ligne peut avoir une alerte `device_offline` à résoudre.
    if (previous !== "online") await alerts.deviceOnline(device.siteId, receivedAt);
  }

  return {
    async recordStatus(siteCode, message, receivedAt) {
      const device = await repository.findBySiteCode(siteCode);
      if (!device) {
        logger.warn({ siteCode }, "Statut ignoré : aucun objet pour ce site");
        return;
      }
      const previous = device.status;
      const status = nextDeviceStatus(previous, message.status);
      await repository.update(device.id, {
        status,
        // Le Last Will est publié par le broker : ce n'est pas un signe de vie de l'objet.
        ...(message.status === "online" && { lastSeenAt: receivedAt }),
        ...(message.firmwareVersion && { firmwareVersion: message.firmwareVersion }),
      });
      if (status !== previous) {
        logger.info({ siteCode, from: previous, to: status }, "Statut de l'objet modifié");
      }
      if (status === "offline" && previous !== "offline") {
        await alerts.deviceOffline(device.siteId);
      } else if (status === "online" && previous !== "online") {
        await alerts.deviceOnline(device.siteId, receivedAt);
      }
    },

    async recordActivity(siteId, receivedAt) {
      await markSeen(await repository.findBySiteId(siteId), receivedAt);
    },

    async recordActivityForSiteCode(siteCode, receivedAt) {
      await markSeen(await repository.findBySiteCode(siteCode), receivedAt);
    },

    async checkSilence(now) {
      const before = new Date(now.getTime() - DEVICE_SILENCE_TIMEOUT_S * 1000);
      const silent = await repository.findSilentOnline(before);
      for (const device of silent) {
        await repository.update(device.id, { status: nextDeviceStatus(device.status, "silence") });
        logger.warn({ siteId: device.siteId }, "Objet silencieux : passé hors ligne");
        await alerts.deviceOffline(device.siteId);
      }
      return silent;
    },
  };
}
