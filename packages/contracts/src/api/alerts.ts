// Schémas des alertes (route GET /v1/alerts, objet `Alert` de la section 7.3).
import { z } from "zod";
import { AlertSeveritySchema, AlertStatusSchema, AlertTypeSchema } from "../enums";
import { Iso8601UtcSchema } from "../primitives";
import { IdSchema, PageQuerySchema, pageSchema } from "./common";

/** Référence minimale à un site ou à un panneau. */
const NamedRefSchema = z.object({ id: z.uuid(), name: z.string() });

/** Objet `Alert`. */
export const AlertSchema = z.object({
  id: z.uuid(),
  type: AlertTypeSchema,
  severity: AlertSeveritySchema,
  /** Texte en français, affichable tel quel. */
  message: z.string().min(1).max(200),
  status: AlertStatusSchema,
  site: NamedRefSchema,
  panel: NamedRefSchema.nullable(),
  startedAt: Iso8601UtcSchema,
  endedAt: Iso8601UtcSchema.nullable(),
});
export type Alert = z.infer<typeof AlertSchema>;

/** `GET /v1/alerts` : paramètres de requête. */
export const AlertsQuerySchema = PageQuerySchema.extend({
  status: AlertStatusSchema.optional(),
  siteId: IdSchema.optional(),
});
export type AlertsQuery = z.infer<typeof AlertsQuerySchema>;

/** `GET /v1/alerts` : réponse 200, une page d'alertes. */
export const AlertPageSchema = pageSchema(AlertSchema);
export type AlertPage = z.infer<typeof AlertPageSchema>;
