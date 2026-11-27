// Enrôlement des objets (séquence 4.7 et diagramme d'états 5.4 de l'UML, D027, D035) : demande
// et suivi par l'objet, acceptation, refus et révocation par un exploitant, ACL et liste de
// révocation du broker regénérées depuis la base.
import {
  DEFAULT_PAGE_LIMIT,
  ENROLLMENT_PENDING_TTL_MIN,
  type AcceptEnrollmentRequest,
  type Enrollment,
  type EnrollmentPage,
  type EnrollmentRequest,
  type EnrollmentsQuery,
  type EnrollmentStatusResponse,
} from "@solar/contracts";
import { AppError, DEFAULT_MESSAGES } from "../../errors";
import { parseCsr, randomSerialNumber, type CertificateAuthority } from "./authority";
import type { BrokerAccess } from "./broker";
import type { EnrollmentRow, EnrollmentsRepository } from "./repository";

/** Tolérance sur l'horloge de l'objet : le certificat est valable un peu avant sa signature. */
const NOT_BEFORE_MARGIN_MS = 60_000;

export interface EnrollmentLogger {
  error: (details: object, message: string) => void;
}

export interface EnrollmentService {
  /** `POST /v1/enrollments` (public, l'objet). */
  request: (body: EnrollmentRequest) => Promise<EnrollmentStatusResponse>;
  /** `GET /v1/enrollments/{fingerprint}` (public, l'objet). */
  status: (fingerprint: string) => Promise<EnrollmentStatusResponse>;
  /** `GET /v1/enrollments` (rôle `operator`). */
  list: (query: EnrollmentsQuery) => Promise<EnrollmentPage>;
  /** `POST /v1/enrollments/{id}/accept` (rôle `operator`). */
  accept: (id: string, operatorId: string, body: AcceptEnrollmentRequest) => Promise<Enrollment>;
  /** `POST /v1/enrollments/{id}/reject` (rôle `operator`). */
  reject: (id: string, operatorId: string) => Promise<Enrollment>;
  /** `POST /v1/enrollments/{id}/revoke` (rôle `operator`). */
  revoke: (id: string) => Promise<Enrollment>;
  /** Planificateur : expiration des demandes et certificats échus, broker mis à jour si besoin. */
  expireStale: () => Promise<void>;
  /** Regénère l'ACL et la liste de révocation depuis la base, puis recharge le broker. */
  syncBroker: () => Promise<void>;
}

export function toEnrollment(row: EnrollmentRow): Enrollment {
  return {
    id: row.id,
    deviceName: row.deviceName,
    fingerprint: row.fingerprint,
    status: row.status,
    requestedAt: row.requestedAt.toISOString(),
    pendingExpiresAt: row.pendingExpiresAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedBy:
      row.decidedBy && row.decidedByName ? { id: row.decidedBy, name: row.decidedByName } : null,
    serialNumber: row.serialNumber,
    certificateExpiresAt: row.certificateExpiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

/** Réponse à l'objet : le certificat n'est renvoyé que s'il est actif. */
export function toStatusResponse(row: EnrollmentRow): EnrollmentStatusResponse {
  const active = row.status === "active";
  return {
    fingerprint: row.fingerprint,
    status: row.status,
    pendingExpiresAt: row.pendingExpiresAt.toISOString(),
    certificate: active ? row.certificatePem : null,
    certificateExpiresAt: active ? (row.certificateExpiresAt?.toISOString() ?? null) : null,
  };
}

const notFound = () => new AppError("NOT_FOUND", DEFAULT_MESSAGES.NOT_FOUND);
const invalidState = (message: string) => new AppError("INVALID_ENROLLMENT_STATE", message);

export function createEnrollmentService(
  repository: EnrollmentsRepository,
  authority: CertificateAuthority,
  broker: BrokerAccess,
  logger: EnrollmentLogger,
  now: () => Date = () => new Date(),
): EnrollmentService {
  async function syncBroker() {
    const [devices, revoked] = await Promise.all([
      repository.listActiveDevices(),
      repository.listRevoked(),
    ]);
    const crl = await authority.revocationList(revoked, now());
    await broker.apply(devices, crl);
  }

  /** Après une décision enregistrée : le broker doit suivre, sinon l'exploitant est prévenu. */
  async function syncAfterDecision() {
    try {
      await syncBroker();
    } catch (error) {
      logger.error(
        { err: error },
        "Rechargement du broker impossible après une décision d'enrôlement",
      );
      throw new AppError("BROKER_UNAVAILABLE", DEFAULT_MESSAGES.BROKER_UNAVAILABLE);
    }
  }

  /** Les demandes en attente échues passent en `expired` avant toute lecture ou décision. */
  async function expire() {
    const { active } = await repository.expire(now());
    if (active > 0) {
      await syncBroker().catch((error: unknown) =>
        logger.error({ err: error }, "Rechargement du broker impossible après une expiration"),
      );
    }
  }

  return {
    async request({ deviceName, csr }) {
      const { fingerprint } = await parseCsr(csr);
      const device = await repository.findDeviceByName(deviceName);
      if (!device) throw new AppError("NOT_FOUND", "Objet inconnu.");
      await expire();

      const pendingResponse = async () => {
        const pending = await repository.findPendingForDevice(device.id);
        if (!pending) return null;
        // La même demande renvoyée reçoit la réponse de la première ; une autre clé est refusée.
        if (pending.fingerprint === fingerprint) return toStatusResponse(pending);
        throw new AppError("ENROLLMENT_PENDING", DEFAULT_MESSAGES.ENROLLMENT_PENDING);
      };
      const existing = await pendingResponse();
      if (existing) return existing;

      const inserted = await repository.insertPending({
        deviceId: device.id,
        fingerprint,
        csrPem: csr,
        pendingExpiresAt: new Date(now().getTime() + ENROLLMENT_PENDING_TTL_MIN * 60_000),
      });
      if (inserted) return toStatusResponse(inserted);
      // Une autre demande a été insérée entre-temps (index unique) : même règle.
      const concurrent = await pendingResponse();
      if (concurrent) return concurrent;
      throw new AppError("ENROLLMENT_PENDING", DEFAULT_MESSAGES.ENROLLMENT_PENDING);
    },

    async status(fingerprint) {
      await expire();
      const row = await repository.findLatestByFingerprint(fingerprint);
      if (!row) throw notFound();
      return toStatusResponse(row);
    },

    async list(query) {
      await expire();
      const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
      const before = query.before ? new Date(query.before) : undefined;
      const rows = await repository.list(limit + 1, query.status, before);
      const items = rows.slice(0, limit);
      const next = rows.length > limit ? items[items.length - 1]!.requestedAt.toISOString() : null;
      return { items: items.map(toEnrollment), next };
    },

    async accept(id, operatorId, { ttlHours }) {
      await expire();
      const row = await repository.findById(id);
      if (!row) throw notFound();
      if (row.status !== "pending") {
        throw invalidState("Seule une demande en attente peut être acceptée.");
      }
      const decidedAt = now();
      const certificateExpiresAt = new Date(decidedAt.getTime() + ttlHours * 3_600_000);
      const serialNumber = randomSerialNumber();
      // Nom commun imposé : celui de l'objet en base, jamais celui écrit dans la demande.
      const certificatePem = await authority.sign({
        csrPem: row.csrPem,
        commonName: row.deviceName,
        serialNumber,
        notBefore: new Date(decidedAt.getTime() - NOT_BEFORE_MARGIN_MS),
        notAfter: certificateExpiresAt,
      });
      const activated = await repository.activate(id, {
        decidedBy: operatorId,
        decidedAt,
        serialNumber,
        certificatePem,
        certificateExpiresAt,
      });
      if (!activated) throw invalidState("Seule une demande en attente peut être acceptée.");
      await syncAfterDecision();
      return toEnrollment(activated);
    },

    async reject(id, operatorId) {
      await expire();
      const rejected = await repository.reject(id, operatorId, now());
      if (rejected) return toEnrollment(rejected);
      if (!(await repository.findById(id))) throw notFound();
      throw invalidState("Seule une demande en attente peut être refusée.");
    },

    async revoke(id) {
      await expire();
      const revoked = await repository.revoke(id, now());
      if (!revoked) {
        if (!(await repository.findById(id))) throw notFound();
        throw invalidState("Seul un certificat actif peut être révoqué.");
      }
      await syncAfterDecision();
      return toEnrollment(revoked);
    },

    expireStale: expire,
    syncBroker,
  };
}
