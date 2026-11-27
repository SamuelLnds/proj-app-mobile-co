// Briques communes aux schémas de l'API REST (section 7.1 de la cartographie technique).
import { z } from "zod";
import { Iso8601UtcSchema } from "../primitives";

/** Identifiant d'une ressource (UUID). */
export const IdSchema = z.uuid();

/** Paramètre de chemin `{id}`. */
export const IdParamsSchema = z.object({ id: IdSchema });
export type IdParams = z.infer<typeof IdParamsSchema>;

/** Nombre d'éléments par page : 20 par défaut, 100 au maximum. */
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/** Paramètres de la pagination par curseur : `limit` et `before` (date ISO). */
export const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
  before: Iso8601UtcSchema.optional(),
});
export type PageQuery = z.infer<typeof PageQuerySchema>;

/** Construit le schéma d'une page : `items` et `next` (curseur ou `null`). */
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    next: Iso8601UtcSchema.nullable(),
  });
}

/** Intervalle de moyennage des courbes de mesures. */
export const MeasurementIntervalSchema = z.enum(["1m", "5m", "15m", "1h"]);
export type MeasurementInterval = z.infer<typeof MeasurementIntervalSchema>;

/** Écart maximal entre `from` et `to` (7 jours, en millisecondes). */
export const MAX_MEASUREMENT_RANGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Paramètres d'une requête de courbe : `from`, `to` (écart de 7 jours au plus) et `interval`. */
export const MeasurementQuerySchema = z
  .object({
    from: Iso8601UtcSchema,
    to: Iso8601UtcSchema,
    interval: MeasurementIntervalSchema,
  })
  .superRefine((query, ctx) => {
    const span = Date.parse(query.to) - Date.parse(query.from);
    if (span < 0) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "to doit suivre from" });
    } else if (span > MAX_MEASUREMENT_RANGE_MS) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "L'écart entre from et to ne doit pas dépasser 7 jours",
      });
    }
  });
export type MeasurementQuery = z.infer<typeof MeasurementQuerySchema>;
