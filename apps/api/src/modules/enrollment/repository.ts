// Requêtes sur les demandes d'enrôlement et les certificats des objets (table device_enrollments).
import { and, desc, eq, isNotNull, lt, sql } from "drizzle-orm";
import type { EnrollmentStatus } from "@solar/contracts";
import type { Database } from "../../db/client";
import { deviceEnrollments, devices, sites, users } from "../../db/schema";

export type EnrollmentRow = typeof deviceEnrollments.$inferSelect & {
  deviceName: string;
  siteCode: string;
  decidedByName: string | null;
};

export interface DeviceRef {
  id: string;
  name: string;
}

export interface NewEnrollment {
  deviceId: string;
  fingerprint: string;
  csrPem: string;
  pendingExpiresAt: Date;
}

export interface IssuedCertificate {
  decidedBy: string;
  decidedAt: Date;
  serialNumber: string;
  certificatePem: string;
  certificateExpiresAt: Date;
}

export interface EnrollmentsRepository {
  findDeviceByName: (name: string) => Promise<DeviceRef | null>;
  findById: (id: string) => Promise<EnrollmentRow | null>;
  /** Demande la plus récente pour cette empreinte. */
  findLatestByFingerprint: (fingerprint: string) => Promise<EnrollmentRow | null>;
  findPendingForDevice: (deviceId: string) => Promise<EnrollmentRow | null>;
  /** Insère une demande ; `null` si une autre est déjà en attente pour l'objet (index unique). */
  insertPending: (enrollment: NewEnrollment) => Promise<EnrollmentRow | null>;
  list: (limit: number, status?: EnrollmentStatus, before?: Date) => Promise<EnrollmentRow[]>;
  /**
   * Acceptation : révoque le certificat actif précédent du même objet et active celui-ci, dans
   * une transaction. Renvoie `null` si la demande n'est plus en attente.
   */
  activate: (id: string, issued: IssuedCertificate) => Promise<EnrollmentRow | null>;
  /** Refus d'une demande en attente ; `null` si elle n'est plus en attente. */
  reject: (id: string, decidedBy: string, decidedAt: Date) => Promise<EnrollmentRow | null>;
  /** Révocation d'un certificat actif ; `null` s'il n'est plus actif. */
  revoke: (id: string, revokedAt: Date) => Promise<EnrollmentRow | null>;
  /** Passe en `expired` les demandes et certificats échus ; renvoie le nombre de certificats actifs expirés. */
  expire: (now: Date) => Promise<{ pending: number; active: number }>;
  /** Objets au certificat actif, avec le code de leur site (ACL du broker). */
  listActiveDevices: () => Promise<Array<{ deviceName: string; siteCode: string }>>;
  /** Certificats révoqués (liste de révocation). */
  listRevoked: () => Promise<Array<{ serialNumber: string; revokedAt: Date }>>;
}

/** Violation d'un index unique (PostgreSQL). */
const isUniqueViolation = (error: unknown) =>
  (error as { code?: string })?.code === "23505" ||
  (error as { cause?: { code?: string } })?.cause?.code === "23505";

export function createEnrollmentsRepository({ db }: Database): EnrollmentsRepository {
  const select = () =>
    db
      .select({
        enrollment: deviceEnrollments,
        deviceName: devices.mqttClientId,
        siteCode: sites.code,
        decidedByName: users.name,
      })
      .from(deviceEnrollments)
      .innerJoin(devices, eq(devices.id, deviceEnrollments.deviceId))
      .innerJoin(sites, eq(sites.id, devices.siteId))
      .leftJoin(users, eq(users.id, deviceEnrollments.decidedBy));

  type Selected = Awaited<ReturnType<ReturnType<typeof select>["execute"]>>[number];
  const toRow = (row: Selected): EnrollmentRow => ({
    ...row.enrollment,
    deviceName: row.deviceName,
    siteCode: row.siteCode,
    decidedByName: row.decidedByName,
  });

  async function findById(id: string): Promise<EnrollmentRow | null> {
    const [row] = await select().where(eq(deviceEnrollments.id, id));
    return row ? toRow(row) : null;
  }

  return {
    async findDeviceByName(name) {
      const [device] = await db
        .select({ id: devices.id, name: devices.mqttClientId })
        .from(devices)
        .where(eq(devices.mqttClientId, name));
      return device ?? null;
    },

    findById,

    async findLatestByFingerprint(fingerprint) {
      const [row] = await select()
        .where(eq(deviceEnrollments.fingerprint, fingerprint))
        .orderBy(desc(deviceEnrollments.requestedAt))
        .limit(1);
      return row ? toRow(row) : null;
    },

    async findPendingForDevice(deviceId) {
      const [row] = await select().where(
        and(eq(deviceEnrollments.deviceId, deviceId), eq(deviceEnrollments.status, "pending")),
      );
      return row ? toRow(row) : null;
    },

    async insertPending(enrollment) {
      try {
        const [inserted] = await db
          .insert(deviceEnrollments)
          .values(enrollment)
          .returning({ id: deviceEnrollments.id });
        return inserted ? findById(inserted.id) : null;
      } catch (error) {
        if (isUniqueViolation(error)) return null;
        throw error;
      }
    },

    async list(limit, status, before) {
      const rows = await select()
        .where(
          and(
            status ? eq(deviceEnrollments.status, status) : undefined,
            before ? lt(deviceEnrollments.requestedAt, before) : undefined,
          ),
        )
        .orderBy(desc(deviceEnrollments.requestedAt))
        .limit(limit);
      return rows.map(toRow);
    },

    async activate(id, issued) {
      const updated = await db.transaction(async (tx) => {
        const [pending] = await tx
          .select({ deviceId: deviceEnrollments.deviceId })
          .from(deviceEnrollments)
          .where(and(eq(deviceEnrollments.id, id), eq(deviceEnrollments.status, "pending")))
          .for("update");
        if (!pending) return false;
        // Un seul certificat actif par objet : le précédent est révoqué (D027).
        await tx
          .update(deviceEnrollments)
          .set({ status: "revoked", revokedAt: issued.decidedAt })
          .where(
            and(
              eq(deviceEnrollments.deviceId, pending.deviceId),
              eq(deviceEnrollments.status, "active"),
            ),
          );
        await tx
          .update(deviceEnrollments)
          .set({ status: "active", ...issued })
          .where(eq(deviceEnrollments.id, id));
        return true;
      });
      return updated ? findById(id) : null;
    },

    async reject(id, decidedBy, decidedAt) {
      const [row] = await db
        .update(deviceEnrollments)
        .set({ status: "rejected", decidedBy, decidedAt })
        .where(and(eq(deviceEnrollments.id, id), eq(deviceEnrollments.status, "pending")))
        .returning({ id: deviceEnrollments.id });
      return row ? findById(row.id) : null;
    },

    async revoke(id, revokedAt) {
      const [row] = await db
        .update(deviceEnrollments)
        .set({ status: "revoked", revokedAt })
        .where(and(eq(deviceEnrollments.id, id), eq(deviceEnrollments.status, "active")))
        .returning({ id: deviceEnrollments.id });
      return row ? findById(row.id) : null;
    },

    async expire(now) {
      const pending = await db
        .update(deviceEnrollments)
        .set({ status: "expired" })
        .where(
          and(eq(deviceEnrollments.status, "pending"), lt(deviceEnrollments.pendingExpiresAt, now)),
        )
        .returning({ id: deviceEnrollments.id });
      const active = await db
        .update(deviceEnrollments)
        .set({ status: "expired" })
        .where(
          and(
            eq(deviceEnrollments.status, "active"),
            lt(deviceEnrollments.certificateExpiresAt, now),
          ),
        )
        .returning({ id: deviceEnrollments.id });
      return { pending: pending.length, active: active.length };
    },

    async listActiveDevices() {
      return db
        .select({ deviceName: devices.mqttClientId, siteCode: sites.code })
        .from(deviceEnrollments)
        .innerJoin(devices, eq(devices.id, deviceEnrollments.deviceId))
        .innerJoin(sites, eq(sites.id, devices.siteId))
        .where(eq(deviceEnrollments.status, "active"));
    },

    async listRevoked() {
      const rows = await db
        .select({
          serialNumber: deviceEnrollments.serialNumber,
          revokedAt: deviceEnrollments.revokedAt,
        })
        .from(deviceEnrollments)
        .where(
          and(
            eq(deviceEnrollments.status, "revoked"),
            isNotNull(deviceEnrollments.serialNumber),
            sql`${deviceEnrollments.revokedAt} IS NOT NULL`,
          ),
        );
      return rows.map((row) => ({ serialNumber: row.serialNumber!, revokedAt: row.revokedAt! }));
    },
  };
}
