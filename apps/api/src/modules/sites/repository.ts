// Requêtes de consultation des sites.
import { and, count, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { alerts, devices, setpoints, siteMeasurements, sites, users } from "../../db/schema";

export type SiteRow = typeof sites.$inferSelect;
export type DeviceRow = Pick<typeof devices.$inferSelect, "status" | "lastSeenAt">;
export type MeasurementRow = typeof siteMeasurements.$inferSelect;
export type SetpointRow = typeof setpoints.$inferSelect & { authorName: string };

export interface SitesRepository {
  listSites: () => Promise<SiteRow[]>;
  findSite: (id: string) => Promise<SiteRow | null>;
  findDevice: (siteId: string) => Promise<DeviceRow | null>;
  findLatestMeasurement: (siteId: string) => Promise<MeasurementRow | null>;
  countActiveAlerts: (siteId: string) => Promise<number>;
  findLatestSetpoint: (siteId: string) => Promise<SetpointRow | null>;
}

export function createSitesRepository({ db }: Database): SitesRepository {
  return {
    listSites: () => db.select().from(sites).orderBy(sites.code),
    async findSite(id) {
      const [site] = await db.select().from(sites).where(eq(sites.id, id));
      return site ?? null;
    },
    async findDevice(siteId) {
      const [device] = await db
        .select({ status: devices.status, lastSeenAt: devices.lastSeenAt })
        .from(devices)
        .where(eq(devices.siteId, siteId));
      return device ?? null;
    },
    async findLatestMeasurement(siteId) {
      const [row] = await db
        .select()
        .from(siteMeasurements)
        .where(eq(siteMeasurements.siteId, siteId))
        .orderBy(desc(siteMeasurements.time))
        .limit(1);
      return row ?? null;
    },
    async countActiveAlerts(siteId) {
      const [row] = await db
        .select({ value: count() })
        .from(alerts)
        .where(and(eq(alerts.siteId, siteId), eq(alerts.status, "active")));
      return row?.value ?? 0;
    },
    async findLatestSetpoint(siteId) {
      const [row] = await db
        .select({ setpoint: setpoints, authorName: users.name })
        .from(setpoints)
        .innerJoin(users, eq(users.id, setpoints.authorId))
        .where(eq(setpoints.siteId, siteId))
        .orderBy(desc(setpoints.createdAt))
        .limit(1);
      return row ? { ...row.setpoint, authorName: row.authorName } : null;
    },
  };
}
