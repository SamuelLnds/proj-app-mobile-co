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

export function createDevicesService(
  repository: DevicesRepository,
  logger: FastifyBaseLogger,
): DevicesService {
  async function markSeen(device: DeviceRow | null, receivedAt: Date) {
    if (!device) return;
    await repository.update(device.id, {
      status: nextDeviceStatus(device.status, "message"),
      lastSeenAt: receivedAt,
    });
  }

  return {
    async recordStatus(siteCode, message, receivedAt) {
      const device = await repository.findBySiteCode(siteCode);
      if (!device) {
        logger.warn({ siteCode }, "Statut ignoré : aucun objet pour ce site");
        return;
      }
      const status = nextDeviceStatus(device.status, message.status);
      await repository.update(device.id, {
        status,
        // Le Last Will est publié par le broker : ce n'est pas un signe de vie de l'objet.
        ...(message.status === "online" && { lastSeenAt: receivedAt }),
        ...(message.firmwareVersion && { firmwareVersion: message.firmwareVersion }),
      });
      if (status !== device.status) {
        logger.info({ siteCode, from: device.status, to: status }, "Statut de l'objet modifié");
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
      }
      return silent;
    },
  };
}
