// Panneaux : statut calculé (section 6 de l'UML), production attendue, modification.
import {
  DEFAULT_PANEL_RATED_POWER_W,
  MAX_PANELS_PER_SITE,
  PANEL_NO_DATA_TIMEOUT_S,
  type Alert,
  type CreatePanelRequest,
  type PanelDetail,
  type PanelStatus,
  type PanelSummary,
  type UpdatePanelRequest,
} from "@solar/contracts";
import { AppError, DEFAULT_MESSAGES } from "../../errors";
import type { AlertRow, LatestPanelMeasurement, PanelRow, PanelsRepository } from "./repository";

export interface PanelsService {
  listPanels: (siteId: string) => Promise<PanelSummary[]>;
  getPanel: (panelId: string) => Promise<PanelDetail>;
  updatePanel: (panelId: string, body: UpdatePanelRequest) => Promise<PanelDetail>;
  /** `POST /v1/sites/{id}/panels` (bonus #63) : panneau ajouté sur le terrain, positionné. */
  createPanel: (siteId: string, body: CreatePanelRequest) => Promise<PanelDetail>;
  deletePanel: (panelId: string) => Promise<void>;
}

/**
 * Statut d'un panneau : `alert` s'il a une alerte active ; sinon `no_data` si sa dernière
 * mesure date de plus de `PANEL_NO_DATA_TIMEOUT_S` (ou s'il n'en a aucune) ; sinon `normal`.
 */
export function panelStatus(
  latest: LatestPanelMeasurement | undefined,
  activeAlertCount: number,
  now: Date,
): PanelStatus {
  if (activeAlertCount > 0) return "alert";
  if (!latest || now.getTime() - latest.time.getTime() > PANEL_NO_DATA_TIMEOUT_S * 1000) {
    return "no_data";
  }
  return "normal";
}

/** Production attendue d'un panneau (W) : ensoleillement du site × puissance nominale / 1000. */
export function expectedPanelProduction(irradiance: number, ratedPowerW: number): number {
  return (irradiance * ratedPowerW) / 1000;
}

const notFound = () => new AppError("NOT_FOUND", DEFAULT_MESSAGES.NOT_FOUND);

export function createPanelsService(
  repository: PanelsRepository,
  now: () => Date = () => new Date(),
): PanelsService {
  function summary(
    panel: PanelRow,
    latest: LatestPanelMeasurement | undefined,
    alertCount: number,
  ): PanelSummary {
    const placed = panel.latitude !== null && panel.longitude !== null;
    return {
      id: panel.id,
      code: panel.code,
      name: panel.name,
      latitude: panel.latitude,
      longitude: panel.longitude,
      placed,
      source: panel.source,
      status: panelStatus(latest, alertCount, now()),
      latestProduction: latest?.productionW ?? null,
      latestTemperature: latest?.temperatureC ?? null,
    };
  }

  function toAlert(row: AlertRow, site: { id: string; name: string }, panel: PanelRow): Alert {
    return {
      id: row.id,
      type: row.type,
      severity: row.severity,
      message: row.message,
      status: row.status,
      site,
      panel: { id: panel.id, name: panel.name },
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
    };
  }

  async function detail(panel: PanelRow): Promise<PanelDetail> {
    const [site, latest, alerts, irradiance] = await Promise.all([
      repository.findSite(panel.siteId),
      repository.latestMeasurements([panel.id]),
      repository.activePanelAlerts([panel.id]),
      repository.latestIrradiance(panel.siteId),
    ]);
    if (!site) throw notFound();
    return {
      ...summary(panel, latest.get(panel.id), alerts.length),
      ratedPowerW: panel.ratedPowerW,
      expectedProduction:
        irradiance === null ? null : expectedPanelProduction(irradiance, panel.ratedPowerW),
      activeAlerts: alerts.map((row) => toAlert(row, site, panel)),
    };
  }

  return {
    async listPanels(siteId) {
      if (!(await repository.findSite(siteId))) throw notFound();
      const rows = await repository.listPanels(siteId);
      const ids = rows.map((p) => p.id);
      const [latest, alerts] = await Promise.all([
        repository.latestMeasurements(ids),
        repository.activePanelAlerts(ids),
      ]);
      const alertCounts = new Map<string, number>();
      for (const a of alerts) {
        if (a.panelId) alertCounts.set(a.panelId, (alertCounts.get(a.panelId) ?? 0) + 1);
      }
      return rows.map((p) => summary(p, latest.get(p.id), alertCounts.get(p.id) ?? 0));
    },

    async getPanel(panelId) {
      const panel = await repository.findPanel(panelId);
      if (!panel) throw notFound();
      return detail(panel);
    },

    async updatePanel(panelId, body) {
      const panel = await repository.updatePanel(panelId, body);
      if (!panel) throw notFound();
      return detail(panel);
    },

    async createPanel(siteId, body) {
      if (!(await repository.findSite(siteId))) throw notFound();
      if ((await repository.countPanels(siteId)) >= MAX_PANELS_PER_SITE) {
        throw new AppError(
          "INVALID_REQUEST",
          `Le site compte déjà ${MAX_PANELS_PER_SITE} panneaux, le maximum.`,
        );
      }
      const panel = await repository.createPanel({
        siteId,
        code: body.code,
        name: body.name ?? `Panneau ${body.code}`,
        latitude: body.latitude,
        longitude: body.longitude,
        ratedPowerW: body.ratedPowerW ?? DEFAULT_PANEL_RATED_POWER_W,
      });
      if (!panel) {
        throw new AppError(
          "PANEL_CODE_TAKEN",
          `Un panneau ${body.code} existe déjà sur ce site. S'il vient d'être détecté, placez-le depuis la liste « à positionner ».`,
        );
      }
      return detail(panel);
    },

    async deletePanel(panelId) {
      if (!(await repository.deletePanel(panelId))) throw notFound();
    },
  };
}
