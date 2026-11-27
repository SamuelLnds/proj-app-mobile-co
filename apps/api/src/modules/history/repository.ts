// Historiques agrégés à la volée par time_bucket() (section 5 du modèle de données).
import type { MeasurementInterval } from "@solar/contracts";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";

/** Intervalle PostgreSQL de chaque intervalle de moyennage. */
export const BUCKETS: Record<MeasurementInterval, string> = {
  "1m": "1 minute",
  "5m": "5 minutes",
  "15m": "15 minutes",
  "1h": "1 hour",
};

export interface Range {
  from: string;
  to: string;
  interval: MeasurementInterval;
}

export type SitePointRow = {
  time: Date;
  irradiance: number;
  production: number;
  temperature: number;
  batteryLevel: number;
  batteryPower: number;
  gridPower: number;
};

export type PanelPointRow = {
  time: Date;
  production: number;
  temperature: number;
};

export interface HistoryRepository {
  siteExists: (siteId: string) => Promise<boolean>;
  panelExists: (panelId: string) => Promise<boolean>;
  sitePoints: (siteId: string, range: Range) => Promise<SitePointRow[]>;
  panelPoints: (panelId: string, range: Range) => Promise<PanelPointRow[]>;
}

export function createHistoryRepository({ db }: Database): HistoryRepository {
  const exists = async (table: "sites" | "panels", id: string) => {
    const result = await db.execute(sql`SELECT 1 FROM ${sql.identifier(table)} WHERE id = ${id}`);
    return result.rows.length > 0;
  };

  return {
    siteExists: (siteId) => exists("sites", siteId),
    panelExists: (panelId) => exists("panels", panelId),

    async sitePoints(siteId, { from, to, interval }) {
      // `from` inclus, `to` exclu ; moyennes converties en float8 (avg renvoie numeric).
      const result = await db.execute<SitePointRow>(sql`
        SELECT time_bucket(${BUCKETS[interval]}::interval, time) AS "time",
               avg(irradiance_w_m2)::float8 AS "irradiance",
               avg(production_w)::float8 AS "production",
               avg(temperature_c)::float8 AS "temperature",
               avg(battery_level_pct)::float8 AS "batteryLevel",
               avg(battery_power_w)::float8 AS "batteryPower",
               avg(grid_power_w)::float8 AS "gridPower"
        FROM site_measurements
        WHERE site_id = ${siteId} AND time >= ${from}::timestamptz AND time < ${to}::timestamptz
        GROUP BY 1
        ORDER BY 1`);
      return result.rows;
    },

    async panelPoints(panelId, { from, to, interval }) {
      const result = await db.execute<PanelPointRow>(sql`
        SELECT time_bucket(${BUCKETS[interval]}::interval, time) AS "time",
               avg(production_w)::float8 AS "production",
               avg(temperature_c)::float8 AS "temperature"
        FROM panel_measurements
        WHERE panel_id = ${panelId} AND time >= ${from}::timestamptz AND time < ${to}::timestamptz
        GROUP BY 1
        ORDER BY 1`);
      return result.rows;
    },
  };
}
