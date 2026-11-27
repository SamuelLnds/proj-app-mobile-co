// Schémas des messages MQTT (section 6.2 de docs/conception/03-cartographie-technique.md).
// Un message dont `v` est inconnu ou qui ne respecte pas son schéma doit être ignoré par le
// récepteur, qui le journalise en avertissement.
import { z } from "zod";
import { ControlModeSchema, RejectionReasonSchema } from "../enums";
import {
  BatteryShareSchema,
  checkBatteryShareForMode,
  Iso8601UtcSchema,
  PercentSchema,
  TemperatureSchema,
} from "../primitives";

/** Version actuelle du format des messages. */
export const MESSAGE_VERSION = 1;

/** Version du format : seule la valeur `1` est acceptée. */
const VersionSchema = z.literal(MESSAGE_VERSION);

/** `solar/{siteCode}/measurements` : mesures du site, publiées par l'objet. */
export const SiteMeasurementSchema = z.object({
  v: VersionSchema,
  timestamp: Iso8601UtcSchema,
  /** Ensoleillement (W/m²). */
  irradiance: z.number().min(0).max(1500),
  /** Production totale (W). */
  production: z.number().min(0),
  /** Température (°C). */
  temperature: TemperatureSchema,
  /** Niveau de la batterie (%). */
  batteryLevel: PercentSchema,
  /** Puissance de la batterie (W) : positif = charge, négatif = décharge. */
  batteryPower: z.number(),
  /** Puissance injectée sur le réseau (W). */
  gridPower: z.number().min(0),
  /** Mode en vigueur. */
  mode: ControlModeSchema,
  /** Bouton de démonstration actif. */
  simulatedFault: z.boolean(),
});
export type SiteMeasurement = z.infer<typeof SiteMeasurementSchema>;

/** `solar/{siteCode}/panels/{panelCode}/measurements` : mesures d'un panneau (simulateur). */
export const PanelMeasurementSchema = z.object({
  v: VersionSchema,
  timestamp: Iso8601UtcSchema,
  /** Production du panneau (W). */
  production: z.number().min(0),
  /** Température du panneau (°C). */
  temperature: TemperatureSchema,
});
export type PanelMeasurement = z.infer<typeof PanelMeasurementSchema>;

/**
 * `solar/{siteCode}/setpoint` : consigne envoyée à l'objet par l'API.
 * `batteryShare` est obligatoire en mode `manual` et vaut `null` sinon.
 */
export const SetpointSchema = z
  .object({
    v: VersionSchema,
    /** Identifiant de la consigne en base. */
    id: z.uuid(),
    mode: ControlModeSchema,
    batteryShare: BatteryShareSchema.nullable(),
    /** Date de création de la consigne. */
    issuedAt: Iso8601UtcSchema,
  })
  .superRefine(checkBatteryShareForMode);
export type Setpoint = z.infer<typeof SetpointSchema>;

/** Résultat de l'application d'une consigne par l'objet. */
export const ControlResultSchema = z.enum(["applied", "partial", "rejected"]);
export type ControlResult = z.infer<typeof ControlResultSchema>;

/** `solar/{siteCode}/state` : état appliqué, publié par l'objet. */
export const ControlStateSchema = z.object({
  v: VersionSchema,
  /** Consigne à laquelle cet état répond ; `null` si l'objet n'en a encore reçu aucune. */
  setpointId: z.uuid().nullable(),
  /** Mode appliqué. */
  mode: ControlModeSchema,
  status: ControlResultSchema,
  /** Part effectivement appliquée (`null` en restitution ou si la consigne est invalide). */
  appliedBatteryShare: z.number().int().min(0).max(100).nullable(),
  /** Renseignée si `status` vaut `partial` ou `rejected`. */
  reason: RejectionReasonSchema.nullable(),
  timestamp: Iso8601UtcSchema,
});
export type ControlState = z.infer<typeof ControlStateSchema>;

/** `solar/{siteCode}/status` : connexion de l'objet (et Last Will du broker). */
export const DeviceStatusSchema = z.object({
  v: VersionSchema,
  status: z.enum(["online", "offline"]),
  /** Envoyée avec `online` uniquement. */
  firmwareVersion: z.string().optional(),
});
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;

/** Message fixe du Last Will, publié par le broker lors d'une déconnexion brutale. */
export const DEVICE_LAST_WILL = { v: MESSAGE_VERSION, status: "offline" } as const;
