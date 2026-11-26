// Requêtes d'enregistrement des mesures reçues par MQTT.
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { siteMeasurements, sites } from "../../db/schema";

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

export interface MeasurementsRepository {
  findSiteIdByCode: (code: string) => Promise<string | null>;
  insertSiteMeasurement: (row: SiteMeasurementRow) => Promise<void>;
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
  };
}
