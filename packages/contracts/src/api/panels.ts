// Schémas des panneaux (routes /v1/sites/{id}/panels et /v1/panels/{id}, section 7.3).
import { z } from "zod";
import { PanelSourceSchema } from "../enums";
import { Iso8601UtcSchema, TemperatureSchema } from "../primitives";
import { AlertSchema } from "./alerts";

const LatitudeSchema = z.number().min(-90).max(90);
const LongitudeSchema = z.number().min(-180).max(180);

/** Statut d'un panneau : normal, en alerte ou sans donnée récente. */
export const PanelStatusSchema = z.enum(["normal", "alert", "no_data"]);
export type PanelStatus = z.infer<typeof PanelStatusSchema>;

/** Objet `PanelSummary`. `latitude` et `longitude` valent `null` si le panneau n'est pas positionné. */
export const PanelSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  latitude: LatitudeSchema.nullable(),
  longitude: LongitudeSchema.nullable(),
  placed: z.boolean(),
  source: PanelSourceSchema,
  status: PanelStatusSchema,
  latestProduction: z.number().min(0).nullable(),
  latestTemperature: TemperatureSchema.nullable(),
});
export type PanelSummary = z.infer<typeof PanelSummarySchema>;

/** `GET /v1/sites/{id}/panels` : réponse 200, liste de `PanelSummary`. */
export const PanelListSchema = z.array(PanelSummarySchema);
export type PanelList = z.infer<typeof PanelListSchema>;

/** Objet `PanelDetail` : champs de `PanelSummary` + puissance, production attendue, alertes actives. */
export const PanelDetailSchema = PanelSummarySchema.extend({
  ratedPowerW: z.number().int().positive(),
  expectedProduction: z.number().min(0).nullable(),
  activeAlerts: z.array(AlertSchema),
});
export type PanelDetail = z.infer<typeof PanelDetailSchema>;

/**
 * `PATCH /v1/panels/{id}` : corps de la requête. Tous les champs sont facultatifs mais au moins
 * un est requis, et `latitude` et `longitude` vont ensemble.
 */
export const UpdatePanelRequestSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    latitude: LatitudeSchema.optional(),
    longitude: LongitudeSchema.optional(),
    ratedPowerW: z.number().int().positive().optional(),
  })
  .superRefine((body, ctx) => {
    if (Object.values(body).every((value) => value === undefined)) {
      ctx.addIssue({ code: "custom", message: "Au moins un champ est requis" });
    }
    if ((body.latitude === undefined) !== (body.longitude === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: [body.latitude === undefined ? "latitude" : "longitude"],
        message: "latitude et longitude doivent être renseignées ensemble",
      });
    }
  });
export type UpdatePanelRequest = z.infer<typeof UpdatePanelRequestSchema>;

/** Point moyenné d'une courbe de panneau : `GET /v1/panels/{id}/measurements`. */
export const PanelMeasurementPointSchema = z.object({
  time: Iso8601UtcSchema,
  production: z.number().min(0),
  temperature: TemperatureSchema,
});
export type PanelMeasurementPoint = z.infer<typeof PanelMeasurementPointSchema>;

/** `GET /v1/panels/{id}/measurements` : réponse 200. */
export const PanelMeasurementSeriesSchema = z.array(PanelMeasurementPointSchema);
