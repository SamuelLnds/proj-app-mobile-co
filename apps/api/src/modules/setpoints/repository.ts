// Requêtes sur les consignes.
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { ControlMode, DeviceStatusValue, RejectionReason } from "@solar/contracts";
import type { Database } from "../../db/client";
import { devices, setpoints, sites, users } from "../../db/schema";

export type SetpointRow = typeof setpoints.$inferSelect & { authorName: string };

export interface SiteRef {
  id: string;
  code: string;
  name: string;
}

export interface NewSetpoint {
  siteId: string;
  authorId: string;
  mode: ControlMode;
  requestedBatteryShare: number | null;
}

/** Réponse de l'objet reportée sur la consigne (première réponse seulement). */
export interface SetpointResponse {
  status: "applied" | "partial" | "rejected";
  appliedBatteryShare: number | null;
  rejectionReason: RejectionReason | null;
  respondedAt: Date;
}

export interface SetpointsRepository {
  findSite: (siteId: string) => Promise<SiteRef | null>;
  findSiteByCode: (siteCode: string) => Promise<SiteRef | null>;
  findDeviceStatus: (siteId: string) => Promise<DeviceStatusValue | null>;
  insert: (setpoint: NewSetpoint) => Promise<SetpointRow>;
  /** Consigne la plus récente du site : la consigne « en vigueur ». */
  findLatest: (siteId: string) => Promise<SetpointRow | null>;
  /** Consignes du site, de la plus récente à la plus ancienne, créées avant `before`. */
  list: (siteId: string, limit: number, before?: Date) => Promise<SetpointRow[]>;
  /**
   * Enregistre la réponse si la consigne est encore `sent` ou `no_response` ;
   * renvoie la consigne mise à jour, ou `null` si elle avait déjà une réponse.
   */
  applyResponse: (id: string, response: SetpointResponse) => Promise<SetpointRow | null>;
  /** Passe en `no_response` les consignes `sent` créées avant `before` ; renvoie celles qui ont changé. */
  markNoResponse: (before: Date) => Promise<Array<{ id: string; siteId: string }>>;
}

export function createSetpointsRepository({ db }: Database): SetpointsRepository {
  async function list(siteId: string, limit: number, before?: Date): Promise<SetpointRow[]> {
    const rows = await db
      .select({ setpoint: setpoints, authorName: users.name })
      .from(setpoints)
      .innerJoin(users, eq(users.id, setpoints.authorId))
      .where(
        and(eq(setpoints.siteId, siteId), before ? lt(setpoints.createdAt, before) : undefined),
      )
      .orderBy(desc(setpoints.createdAt))
      .limit(limit);
    return rows.map((row) => ({ ...row.setpoint, authorName: row.authorName }));
  }

  async function withAuthor(id: string): Promise<SetpointRow | null> {
    const [row] = await db
      .select({ setpoint: setpoints, authorName: users.name })
      .from(setpoints)
      .innerJoin(users, eq(users.id, setpoints.authorId))
      .where(eq(setpoints.id, id));
    return row ? { ...row.setpoint, authorName: row.authorName } : null;
  }

  async function findSiteWhere(condition: ReturnType<typeof eq>): Promise<SiteRef | null> {
    const [site] = await db
      .select({ id: sites.id, code: sites.code, name: sites.name })
      .from(sites)
      .where(condition);
    return site ?? null;
  }

  return {
    findSite: (siteId) => findSiteWhere(eq(sites.id, siteId)),
    findSiteByCode: (siteCode) => findSiteWhere(eq(sites.code, siteCode)),
    async findDeviceStatus(siteId) {
      const [device] = await db
        .select({ status: devices.status })
        .from(devices)
        .where(eq(devices.siteId, siteId));
      return device?.status ?? null;
    },
    async insert(setpoint) {
      const [created] = await db.insert(setpoints).values(setpoint).returning({ id: setpoints.id });
      const row = created ? await withAuthor(created.id) : null;
      if (!row) throw new Error("Consigne introuvable après son insertion");
      return row;
    },
    async findLatest(siteId) {
      const [row] = await list(siteId, 1);
      return row ?? null;
    },
    list,
    async applyResponse(id, response) {
      const updated = await db
        .update(setpoints)
        .set(response)
        .where(and(eq(setpoints.id, id), inArray(setpoints.status, ["sent", "no_response"])))
        .returning({ id: setpoints.id });
      return updated.length > 0 ? withAuthor(id) : null;
    },
    markNoResponse: (before) =>
      db
        .update(setpoints)
        .set({ status: "no_response" })
        .where(and(eq(setpoints.status, "sent"), lt(setpoints.createdAt, before)))
        .returning({ id: setpoints.id, siteId: setpoints.siteId }),
  };
}
