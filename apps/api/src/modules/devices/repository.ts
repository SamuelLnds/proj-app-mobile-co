// Requêtes sur les objets des sites.
import { and, eq, lt } from "drizzle-orm";
import type { DeviceStatusValue } from "@solar/contracts";
import type { Database } from "../../db/client";
import { devices, sites } from "../../db/schema";

export interface DeviceRow {
  id: string;
  siteId: string;
  status: DeviceStatusValue;
}

export interface DeviceUpdate {
  status: DeviceStatusValue;
  lastSeenAt?: Date;
  firmwareVersion?: string;
}

export interface DevicesRepository {
  findBySiteCode: (siteCode: string) => Promise<DeviceRow | null>;
  findBySiteId: (siteId: string) => Promise<DeviceRow | null>;
  update: (id: string, changes: DeviceUpdate) => Promise<void>;
  /** Objets en ligne dont le dernier message est antérieur à `before`. */
  findSilentOnline: (before: Date) => Promise<DeviceRow[]>;
}

const columns = { id: devices.id, siteId: devices.siteId, status: devices.status };

export function createDevicesRepository({ db }: Database): DevicesRepository {
  return {
    async findBySiteCode(siteCode) {
      const [row] = await db
        .select(columns)
        .from(devices)
        .innerJoin(sites, eq(sites.id, devices.siteId))
        .where(eq(sites.code, siteCode));
      return row ?? null;
    },
    async findBySiteId(siteId) {
      const [row] = await db.select(columns).from(devices).where(eq(devices.siteId, siteId));
      return row ?? null;
    },
    async update(id, changes) {
      await db.update(devices).set(changes).where(eq(devices.id, id));
    },
    findSilentOnline: (before) =>
      db
        .select(columns)
        .from(devices)
        .where(and(eq(devices.status, "online"), lt(devices.lastSeenAt, before))),
  };
}
