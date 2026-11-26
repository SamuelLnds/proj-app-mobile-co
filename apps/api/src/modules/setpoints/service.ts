// Consignes : envoi (séquence 4.3 de l'UML), réponse de l'objet (diagramme 5.1), délai de
// réponse et historique.
import {
  DEFAULT_PAGE_LIMIT,
  MESSAGE_VERSION,
  setpointTopic,
  SETPOINT_RESPONSE_TIMEOUT_S,
  type ControlState,
  type CreateSetpointRequest,
  type PageQuery,
  type RejectionReason,
  type Setpoint,
  type SetpointPage,
  type SetpointRecord,
} from "@solar/contracts";
import { AppError, DEFAULT_MESSAGES } from "../../errors";
import type { PublishOptions } from "../../mqtt/client";
import type { SetpointRow, SetpointsRepository } from "./repository";

/** Publication MQTT (`ApiMqttClient.publish`). */
export type PublishFn = (topic: string, message: unknown, options: PublishOptions) => Promise<void>;

export interface SetpointsService {
  /** `POST /v1/sites/{id}/setpoints` (rôle `operator`). */
  create: (
    siteId: string,
    authorId: string,
    body: CreateSetpointRequest,
  ) => Promise<SetpointRecord>;
  /** `GET /v1/sites/{id}/setpoints`. */
  list: (siteId: string, query: PageQuery) => Promise<SetpointPage>;
  /** État appliqué reçu de l'objet (topic `state`). */
  recordState: (siteCode: string, state: ControlState, receivedAt: Date) => Promise<void>;
  /** Passe en `no_response` les consignes sans réponse après le délai ; renvoie leur nombre. */
  checkResponseTimeouts: (now: Date) => Promise<number>;
}

/** Raisons de refus, formulées pour une phrase (« Consigne refusée sur … : la batterie est pleine »). */
const REASON_TEXT: Record<RejectionReason, string> = {
  battery_full: "la batterie est pleine",
  battery_low: "la batterie est faible",
  charge_limit: "puissance de charge maximale atteinte",
  invalid_setpoint: "la consigne est invalide",
};

export function toSetpointRecord(row: SetpointRow): SetpointRecord {
  return {
    id: row.id,
    mode: row.mode,
    requestedBatteryShare: row.requestedBatteryShare,
    status: row.status,
    appliedBatteryShare: row.appliedBatteryShare,
    rejectionReason: row.rejectionReason,
    author: { id: row.authorId, name: row.authorName },
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
  };
}

export function createSetpointsService(
  repository: SetpointsRepository,
  publish: PublishFn,
): SetpointsService {
  const notFound = () => new AppError("NOT_FOUND", DEFAULT_MESSAGES.NOT_FOUND);

  return {
    async create(siteId, authorId, body) {
      const site = await repository.findSite(siteId);
      if (!site) throw notFound();
      if ((await repository.findDeviceStatus(siteId)) !== "online") {
        throw new AppError("DEVICE_OFFLINE", DEFAULT_MESSAGES.DEVICE_OFFLINE);
      }

      const row = await repository.insert({
        siteId,
        authorId,
        mode: body.mode,
        requestedBatteryShare: body.mode === "manual" ? (body.batteryShare ?? null) : null,
      });
      // Une nouvelle consigne résout les alertes de la précédente (section 6 de l'UML).
      await repository.resolveAlerts(
        siteId,
        ["setpoint_rejected", "setpoint_no_response"],
        row.createdAt,
      );

      const message: Setpoint = {
        v: MESSAGE_VERSION,
        id: row.id,
        mode: row.mode,
        batteryShare: row.requestedBatteryShare,
        issuedAt: row.createdAt.toISOString(),
      };
      // Retained : l'objet retrouve la consigne en vigueur après une reconnexion.
      await publish(setpointTopic(site.code), message, { qos: 1, retain: true });
      return toSetpointRecord(row);
    },

    async list(siteId, query) {
      if (!(await repository.findSite(siteId))) throw notFound();
      const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
      const before = query.before ? new Date(query.before) : undefined;
      // Une ligne de plus que la page indique s'il en reste.
      const rows = await repository.list(siteId, limit + 1, before);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toSetpointRecord),
        next: rows.length > limit && last ? last.createdAt.toISOString() : null,
      };
    },

    async recordState(siteCode, state, receivedAt) {
      const site = await repository.findSiteByCode(siteCode);
      if (!site || state.setpointId === null) return;
      // Seule la consigne en vigueur (la plus récente) est concernée.
      const current = await repository.findLatest(site.id);
      if (current?.id !== state.setpointId) return;

      const updated = await repository.applyResponse(current.id, {
        status: state.status,
        appliedBatteryShare: state.appliedBatteryShare,
        // La base exige une raison pour `partial` et `rejected` (et aucune pour `applied`).
        rejectionReason: state.status === "applied" ? null : (state.reason ?? "invalid_setpoint"),
        respondedAt: receivedAt,
      });
      if (!updated) return; // Déjà répondue : seule la première réponse compte.

      // Une réponse tardive met fin à l'alerte « sans réponse ».
      await repository.resolveAlerts(site.id, ["setpoint_no_response"], receivedAt);
      if (updated.status === "rejected") {
        const reason = updated.rejectionReason ? REASON_TEXT[updated.rejectionReason] : "refusée";
        await repository.openAlert({
          siteId: site.id,
          type: "setpoint_rejected",
          severity: "warning",
          message: `Consigne refusée sur ${site.name} : ${reason}`,
        });
      }
    },

    async checkResponseTimeouts(now) {
      const before = new Date(now.getTime() - SETPOINT_RESPONSE_TIMEOUT_S * 1000);
      const expired = await repository.markNoResponse(before);
      for (const { siteId } of expired) {
        const site = await repository.findSite(siteId);
        if (!site) continue;
        await repository.openAlert({
          siteId,
          type: "setpoint_no_response",
          severity: "critical",
          message: `L'objet du site ${site.name} ne répond pas à la consigne`,
        });
      }
      return expired.length;
    },
  };
}
