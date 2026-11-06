// Schémas des sites (routes /v1/sites…, objets `SiteSummary`, `SiteDetail`, `LatestMeasurement`).
import { z } from "zod";
import { ControlModeSchema, DeviceStatusValueSchema } from "../enums";
import { ControlStateSchema } from "../mqtt/messages";
import { Iso8601UtcSchema, PercentSchema, TemperatureSchema } from "../primitives";
import { SetpointRecordSchema } from "./setpoints";

/** Objet `LatestMeasurement` : dernière mesure du site. */
export const LatestMeasurementSchema = z.object({
  timestamp: Iso8601UtcSchema,
  irradiance: z.number().min(0).max(1500),
  production: z.number().min(0),
  /** Production attendue (W) : ensoleillement × facteur de production du site. */
  expectedProduction: z.number().min(0),
  temperature: TemperatureSchema,
  batteryLevel: PercentSchema,
  batteryPower: z.number(),
  gridPower: z.number().min(0),
  mode: ControlModeSchema,
  simulatedFault: z.boolean(),
});
export type LatestMeasurement = z.infer<typeof LatestMeasurementSchema>;

/** Objet `SiteSummary`. */
export const SiteSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  deviceStatus: DeviceStatusValueSchema,
  latestMeasurement: LatestMeasurementSchema.nullable(),
  activeAlertCount: z.number().int().min(0),
});
export type SiteSummary = z.infer<typeof SiteSummarySchema>;

/** `GET /v1/sites` : réponse 200, liste de `SiteSummary`. */
export const SiteListSchema = z.array(SiteSummarySchema);
export type SiteList = z.infer<typeof SiteListSchema>;

/** Objet `SiteDetail` : champs de `SiteSummary` + caractéristiques, consigne et état appliqué. */
export const SiteDetailSchema = SiteSummarySchema.extend({
  peakPowerW: z.number().int().positive(),
  batteryCapacityWh: z.number().int().positive(),
  maxChargePowerW: z.number().int().positive(),
  currentSetpoint: SetpointRecordSchema.nullable(),
  /** Dernier `ControlState` reçu, ou `null`. */
  controlState: ControlStateSchema.nullable(),
  deviceLastSeenAt: Iso8601UtcSchema.nullable(),
});
export type SiteDetail = z.infer<typeof SiteDetailSchema>;

/** Point moyenné d'une courbe de site : `GET /v1/sites/{id}/measurements`. */
export const SiteMeasurementPointSchema = z.object({
  time: Iso8601UtcSchema,
  irradiance: z.number().min(0).max(1500),
  production: z.number().min(0),
  temperature: TemperatureSchema,
  batteryLevel: PercentSchema,
  batteryPower: z.number(),
  gridPower: z.number().min(0),
});
export type SiteMeasurementPoint = z.infer<typeof SiteMeasurementPointSchema>;

/** `GET /v1/sites/{id}/measurements` : réponse 200. */
export const SiteMeasurementSeriesSchema = z.array(SiteMeasurementPointSchema);
export type SiteMeasurementSeries = z.infer<typeof SiteMeasurementSeriesSchema>;
