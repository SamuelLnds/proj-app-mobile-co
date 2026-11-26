// Requêtes d'enregistrement des mesures reçues par MQTT.
import { and, count, eq } from "drizzle-orm";
import { DEFAULT_PANEL_RATED_POWER_W } from "@solar/contracts";
import type { Database } from "../../db/client";
import { panelMeasurements, panels, siteMeasurements, sites } from "../../db/schema";

export interface SiteMeasurementRow {
  time: Date;
  siteId: string;
  irradianceWM2: number;
  productionW: number;
  temperatureC: number;
  batteryLevelPct: number;
  batteryPowerW: number;
  gridPowerW: number;
  mode: "manual" | "automatic" | "discharge";
  simulatedFault: boolean;
}

export interface PanelMeasurementRow {
  time: Date;
  panelId: string;
  productionW: number;
  temperatureC: number;
}

export interface MeasurementsRepository {
  findSiteIdByCode: (code: string) => Promise<string | null>;
  insertSiteMeasurement: (row: SiteMeasurementRow) => Promise<void>;
  findPanelId: (siteId: string, code: string) => Promise<string | null>;
  countPanels: (siteId: string) => Promise<number>;
  /**
   * Crée un panneau détecté (D020) : nom = code, sans position, puissance par défaut.
   * Sans effet si le panneau existe déjà ; renvoie son identifiant dans les deux cas.
   */
  createDiscoveredPanel: (siteId: string, code: string) => Promise<string>;
  insertPanelMeasurement: (row: PanelMeasurementRow) => Promise<void>;
}

export function createMeasurementsRepository({ db }: Database): MeasurementsRepository {
  return {
    async findSiteIdByCode(code) {
      const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.code, code));
      return site?.id ?? null;
    },
    async insertSiteMeasurement(row) {
      // Une mesure déjà reçue pour le même instant (message dupliqué) est ignorée.
      await db.insert(siteMeasurements).values(row).onConflictDoNothing();
    },
    async findPanelId(siteId, code) {
      const [panel] = await db
        .select({ id: panels.id })
        .from(panels)
        .where(and(eq(panels.siteId, siteId), eq(panels.code, code)));
      return panel?.id ?? null;
    },
    async countPanels(siteId) {
      const [row] = await db
        .select({ value: count() })
        .from(panels)
        .where(eq(panels.siteId, siteId));
      return row?.value ?? 0;
    },
    async createDiscoveredPanel(siteId, code) {
      // La contrainte unique (site, code) garantit une seule création, même pour des messages
      // simultanés : les suivants ne font rien et relisent le panneau créé.
      await db
        .insert(panels)
        .values({
          siteId,
          code,
          name: code,
          ratedPowerW: DEFAULT_PANEL_RATED_POWER_W,
          source: "discovered",
        })
        .onConflictDoNothing({ target: [panels.siteId, panels.code] });
      const [panel] = await db
        .select({ id: panels.id })
        .from(panels)
        .where(and(eq(panels.siteId, siteId), eq(panels.code, code)));
      return panel!.id;
    },
    async insertPanelMeasurement(row) {
      await db.insert(panelMeasurements).values(row).onConflictDoNothing();
    },
  };
}
