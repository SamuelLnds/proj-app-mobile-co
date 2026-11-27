// Requêtes du moteur d'alertes et de la consultation des alertes.
import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { AlertStatus, AlertType } from "@solar/contracts";
import type { Database } from "../../db/client";
import { alerts, panels, siteMeasurements, sites } from "../../db/schema";

export interface SiteInfo {
  id: string;
  code: string;
  name: string;
  productionFactor: number;
}

export interface PanelInfo {
  id: string;
  name: string;
  ratedPowerW: number;
}

/** Alerte à ouvrir ; le panneau est absent pour une alerte portant sur le site. */
export interface NewAlert {
  siteId: string;
  panelId?: string | null;
  type: AlertType;
  severity: "info" | "warning" | "critical";
  message: string;
}

export type AlertRow = typeof alerts.$inferSelect;

/** Alerte avec les noms du site et du panneau, prête à être exposée. */
export interface AlertWithNames extends AlertRow {
  siteName: string;
  panelName: string | null;
}

export interface AlertFilter {
  status?: AlertStatus;
  siteId?: string;
  before?: Date;
}

export interface AlertsRepository {
  findSiteByCode: (siteCode: string) => Promise<SiteInfo | null>;
  findSiteById: (siteId: string) => Promise<SiteInfo | null>;
  findPanel: (siteId: string, panelCode: string) => Promise<PanelInfo | null>;
  /** Ensoleillement de la dernière mesure du site, ou `null`. */
  latestIrradiance: (siteId: string) => Promise<number | null>;
  /**
   * Ouvre l'alerte et la renvoie ; renvoie `null` s'il en existe déjà une active pour le
   * même site, panneau et type (index unique).
   */
  insert: (alert: NewAlert) => Promise<AlertRow | null>;
  /** Résout les alertes actives de ces types sur le site (ou sur le panneau) ; renvoie leur nombre. */
  resolve: (
    siteId: string,
    panelId: string | null,
    types: AlertType[],
    endedAt: Date,
  ) => Promise<number>;
  /** Alertes, de la plus récente à la plus ancienne. */
  list: (filter: AlertFilter, limit: number) => Promise<AlertWithNames[]>;
}

export function createAlertsRepository({ db }: Database): AlertsRepository {
  const siteColumns = {
    id: sites.id,
    code: sites.code,
    name: sites.name,
    productionFactor: sites.productionFactor,
  };

  return {
    async findSiteByCode(siteCode) {
      const [site] = await db.select(siteColumns).from(sites).where(eq(sites.code, siteCode));
      return site ?? null;
    },
    async findSiteById(siteId) {
      const [site] = await db.select(siteColumns).from(sites).where(eq(sites.id, siteId));
      return site ?? null;
    },
    async findPanel(siteId, panelCode) {
      const [panel] = await db
        .select({ id: panels.id, name: panels.name, ratedPowerW: panels.ratedPowerW })
        .from(panels)
        .where(and(eq(panels.siteId, siteId), eq(panels.code, panelCode)));
      return panel ?? null;
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
    async insert(alert) {
      // L'index unique « une alerte active par site, panneau et type » écarte les doublons.
      const [row] = await db
        .insert(alerts)
        .values({ ...alert, panelId: alert.panelId ?? null })
        .onConflictDoNothing()
        .returning();
      return row ?? null;
    },
    async resolve(siteId, panelId, types, endedAt) {
      const resolved = await db
        .update(alerts)
        .set({ status: "resolved", endedAt })
        .where(
          and(
            eq(alerts.siteId, siteId),
            panelId ? eq(alerts.panelId, panelId) : isNull(alerts.panelId),
            inArray(alerts.type, types),
            eq(alerts.status, "active"),
          ),
        )
        .returning({ id: alerts.id });
      return resolved.length;
    },
    async list(filter, limit) {
      const rows = await db
        .select({ alert: alerts, siteName: sites.name, panelName: panels.name })
        .from(alerts)
        .innerJoin(sites, eq(sites.id, alerts.siteId))
        .leftJoin(panels, eq(panels.id, alerts.panelId))
        .where(
          and(
            filter.status ? eq(alerts.status, filter.status) : undefined,
            filter.siteId ? eq(alerts.siteId, filter.siteId) : undefined,
            filter.before ? lt(alerts.startedAt, filter.before) : undefined,
          ),
        )
        .orderBy(desc(alerts.startedAt))
        .limit(limit);
      return rows.map((row) => ({
        ...row.alert,
        siteName: row.siteName,
        panelName: row.panelName,
      }));
    },
  };
}
