// Schémas des consignes (routes /v1/sites/{id}/setpoints, objet `Setpoint` de la section 7.3).
import { z } from "zod";
import { ControlModeSchema, RejectionReasonSchema, SetpointStatusSchema } from "../enums";
import { BatteryShareSchema, checkBatteryShareForMode, Iso8601UtcSchema } from "../primitives";
import { pageSchema } from "./common";

/**
 * `POST /v1/sites/{id}/setpoints` : corps de la requête.
 * `batteryShare` est obligatoire en mode `manual`, absente (ou `null`) dans les autres modes.
 */
export const CreateSetpointRequestSchema = z
  .object({
    mode: ControlModeSchema,
    batteryShare: BatteryShareSchema.nullish(),
  })
  .superRefine(checkBatteryShareForMode);
export type CreateSetpointRequest = z.infer<typeof CreateSetpointRequestSchema>;

/**
 * Objet `Setpoint` renvoyé par l'API (nommé `SetpointRecord` pour ne pas être confondu
 * avec le message MQTT `Setpoint`).
 */
export const SetpointRecordSchema = z.object({
  id: z.uuid(),
  mode: ControlModeSchema,
  requestedBatteryShare: z.number().int().min(0).max(100).nullable(),
  status: SetpointStatusSchema,
  appliedBatteryShare: z.number().int().min(0).max(100).nullable(),
  rejectionReason: RejectionReasonSchema.nullable(),
  author: z.object({ id: z.uuid(), name: z.string() }),
  createdAt: Iso8601UtcSchema,
  respondedAt: Iso8601UtcSchema.nullable(),
});
export type SetpointRecord = z.infer<typeof SetpointRecordSchema>;

/** `GET /v1/sites/{id}/setpoints` : réponse 200, une page de consignes. */
export const SetpointPageSchema = pageSchema(SetpointRecordSchema);
export type SetpointPage = z.infer<typeof SetpointPageSchema>;
