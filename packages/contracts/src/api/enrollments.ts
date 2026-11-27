// Schémas de l'enrôlement des objets (routes /v1/enrollments, D027, D035).
// Aucune route ne reçoit ni ne renvoie de clé privée : la demande (CSR) et le certificat sont
// publics par nature.
import { z } from "zod";
import { DEVICE_CERT_DEFAULT_TTL_H, DEVICE_CERT_MAX_TTL_H } from "../constants";
import { EnrollmentStatusSchema } from "../enums";
import { Iso8601UtcSchema } from "../primitives";
import { PageQuerySchema, pageSchema } from "./common";

/** Taille maximale d'un PEM reçu ou renvoyé (une demande P-256 fait moins de 600 caractères). */
const MAX_PEM_LENGTH = 4096;

/** Empreinte d'une clé : SHA-256 de la clé publique (DER), en hexadécimal minuscule. */
export const FingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/, "Empreinte SHA-256 attendue");

/** Nom d'un objet, identique à son identifiant MQTT (`device-site01`). */
export const DeviceNameSchema = z.string().regex(/^[a-z0-9-]{3,64}$/, "Nom d'objet invalide");

/** `POST /v1/enrollments` : corps de la demande envoyée par l'objet. */
export const EnrollmentRequestSchema = z.object({
  deviceName: DeviceNameSchema,
  /** Demande de certificat (PKCS#10) au format PEM. */
  csr: z
    .string()
    .max(MAX_PEM_LENGTH)
    .refine((pem) => pem.includes("-----BEGIN CERTIFICATE REQUEST-----"), {
      message: "Demande de certificat PEM attendue",
    }),
});
export type EnrollmentRequest = z.infer<typeof EnrollmentRequestSchema>;

/** Paramètre de chemin `{fingerprint}` du suivi par l'objet. */
export const FingerprintParamsSchema = z.object({ fingerprint: FingerprintSchema });
export type FingerprintParams = z.infer<typeof FingerprintParamsSchema>;

/**
 * Réponse des deux routes de l'objet : l'état de sa demande, et le certificat signé seulement
 * quand la demande est acceptée et le certificat actif.
 */
export const EnrollmentStatusResponseSchema = z.object({
  fingerprint: FingerprintSchema,
  status: EnrollmentStatusSchema,
  pendingExpiresAt: Iso8601UtcSchema,
  certificate: z.string().max(MAX_PEM_LENGTH).nullable(),
  certificateExpiresAt: Iso8601UtcSchema.nullable(),
});
export type EnrollmentStatusResponse = z.infer<typeof EnrollmentStatusResponseSchema>;

/** Objet `Enrollment` renvoyé à l'app (routes réservées au rôle `operator`). */
export const EnrollmentSchema = z.object({
  id: z.uuid(),
  deviceName: DeviceNameSchema,
  fingerprint: FingerprintSchema,
  status: EnrollmentStatusSchema,
  requestedAt: Iso8601UtcSchema,
  pendingExpiresAt: Iso8601UtcSchema,
  decidedAt: Iso8601UtcSchema.nullable(),
  decidedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  serialNumber: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .nullable(),
  certificateExpiresAt: Iso8601UtcSchema.nullable(),
  revokedAt: Iso8601UtcSchema.nullable(),
});
export type Enrollment = z.infer<typeof EnrollmentSchema>;

/** `GET /v1/enrollments` : paramètres de requête. */
export const EnrollmentsQuerySchema = PageQuerySchema.extend({
  status: EnrollmentStatusSchema.optional(),
});
export type EnrollmentsQuery = z.infer<typeof EnrollmentsQuerySchema>;

/** `GET /v1/enrollments` : réponse 200, une page de demandes. */
export const EnrollmentPageSchema = pageSchema(EnrollmentSchema);
export type EnrollmentPage = z.infer<typeof EnrollmentPageSchema>;

/** `POST /v1/enrollments/{id}/accept` : durée du certificat, en heures. */
export const AcceptEnrollmentRequestSchema = z.object({
  ttlHours: z.number().int().min(1).max(DEVICE_CERT_MAX_TTL_H).default(DEVICE_CERT_DEFAULT_TTL_H),
});
export type AcceptEnrollmentRequest = z.infer<typeof AcceptEnrollmentRequestSchema>;
