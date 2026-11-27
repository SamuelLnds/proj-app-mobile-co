// Requêtes de consultation et de modification des panneaux.
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client";
import { alerts, panelMeasurements, panels, siteMeasurements, sites } from "../../db/schema";

export type PanelRow = typeof panels.$inferSelect;
export type AlertRow = typeof alerts.$inferSelect;

export interface LatestPanelMeasurement {
  time: Date;
  productionW: number;
  temperatureC: number;
}

export interface PanelChanges {
  name?: string;
  latitude?: number;
  longitude?: number;
  ratedPowerW?: number;
}

export interface NewPanel {
  siteId: string;
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  ratedPowerW: number;
}

export interface PanelsRepository {
  findSite: (siteId: string) => Promise<{ id: string; name: string } | null>;
  listPanels: (siteId: string) => Promise<PanelRow[]>;
  findPanel: (panelId: string) => Promise<PanelRow | null>;
  /** Dernière mesure de chaque panneau demandé (absent s'il n'en a aucune). */
  latestMeasurements: (panelIds: string[]) => Promise<Map<string, LatestPanelMeasurement>>;
  /** Ensoleillement de la dernière mesure du site, ou `null`. */
  latestIrradiance: (siteId: string) => Promise<number | null>;
  /** Alertes actives portant sur les panneaux demandés. */
  activePanelAlerts: (panelIds: string[]) => Promise<AlertRow[]>;
  updatePanel: (panelId: string, changes: PanelChanges) => Promise<PanelRow | null>;
  /** Nombre de panneaux du site (limite `MAX_PANELS_PER_SITE`). */
  countPanels: (siteId: string) => Promise<number>;
  /** Panneau ajouté sur le terrain ; `null` si le code existe déjà sur le site (index unique). */
  createPanel: (panel: NewPanel) => Promise<PanelRow | null>;
  /** Supprime le panneau ; ses mesures et alertes suivent (ON DELETE CASCADE). */
  deletePanel: (panelId: string) => Promise<boolean>;
}

export function createPanelsRepository({ db }: Database): PanelsRepository {
  return {
    async findSite(siteId) {
      const [site] = await db
        .select({ id: sites.id, name: sites.name })
        .from(sites)
        .where(eq(sites.id, siteId));
      return site ?? null;
    },
    listPanels: (siteId) =>
      db.select().from(panels).where(eq(panels.siteId, siteId)).orderBy(panels.code),
    async findPanel(panelId) {
      const [panel] = await db.select().from(panels).where(eq(panels.id, panelId));
      return panel ?? null;
    },
    async latestMeasurements(panelIds) {
      const result = new Map<string, LatestPanelMeasurement>();
      if (panelIds.length === 0) return result;
      // Une ligne par panneau : sa mesure la plus récente.
      const rows = await db
        .selectDistinctOn([panelMeasurements.panelId], {
          panelId: panelMeasurements.panelId,
          time: panelMeasurements.time,
          productionW: panelMeasurements.productionW,
          temperatureC: panelMeasurements.temperatureC,
        })
        .from(panelMeasurements)
        .where(inArray(panelMeasurements.panelId, panelIds))
        .orderBy(panelMeasurements.panelId, desc(panelMeasurements.time));
      for (const { panelId, ...measurement } of rows) result.set(panelId, measurement);
      return result;
    },
    async latestIrradiance(siteId) {
      const [row] = await db
        .select({ irradiance: siteMeasurements.irradianceWM2 })
        .from(siteMeasurements)
        .where(eq(siteMeasurements.siteId, siteId))
        .orderBy(desc(siteMeasurements.time))
        .limit(1);
      return row?.irradiance ?? null;
    },
    activePanelAlerts: (panelIds) =>
      panelIds.length === 0
        ? Promise.resolve([])
        : db
            .select()
            .from(alerts)
            .where(and(inArray(alerts.panelId, panelIds), eq(alerts.status, "active")))
            .orderBy(desc(alerts.startedAt)),
    async updatePanel(panelId, changes) {
      const [panel] = await db
        .update(panels)
        .set(changes)
        .where(eq(panels.id, panelId))
        .returning();
      return panel ?? null;
    },
    async countPanels(siteId) {
      const [row] = await db.select({ n: count() }).from(panels).where(eq(panels.siteId, siteId));
      return row?.n ?? 0;
    },
    async createPanel(panel) {
      const [created] = await db
        .insert(panels)
        .values({ ...panel, source: "manual" })
        .onConflictDoNothing({ target: [panels.siteId, panels.code] })
        .returning();
      return created ?? null;
    },
    async deletePanel(panelId) {
      const deleted = await db
        .delete(panels)
        .where(eq(panels.id, panelId))
        .returning({ id: panels.id });
      return deleted.length > 0;
    },
  };
}
