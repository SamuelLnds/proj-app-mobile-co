// Énumérations partagées, identiques aux types énumérés de la base
// (section 3 de docs/conception/01-modele-donnees.md), au caractère près.
import { z } from "zod";

/** Droits d'un utilisateur : l'exploitant envoie des consignes, le lecteur consulte. */
export const UserRoleSchema = z.enum(["operator", "viewer"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

/** Plateforme du téléphone qui a enregistré un jeton de notification. */
export const MobilePlatformSchema = z.enum(["android", "ios"]);
export type MobilePlatform = z.infer<typeof MobilePlatformSchema>;

/** Statut d'un objet ; `unknown` tant qu'il n'a jamais rien publié. */
export const DeviceStatusValueSchema = z.enum(["unknown", "online", "offline"]);
export type DeviceStatusValue = z.infer<typeof DeviceStatusValueSchema>;

/** Origine d'un panneau : démonstration, détecté automatiquement ou ajouté par un exploitant. */
export const PanelSourceSchema = z.enum(["seed", "discovered", "manual"]);
export type PanelSource = z.infer<typeof PanelSourceSchema>;

/** Modes de pilotage : manuel, automatique et restitution. */
export const ControlModeSchema = z.enum(["manual", "automatic", "discharge"]);
export type ControlMode = z.infer<typeof ControlModeSchema>;

/** État d'une consigne au fil de son cycle de vie. */
export const SetpointStatusSchema = z.enum([
  "sent",
  "applied",
  "partial",
  "rejected",
  "no_response",
]);
export type SetpointStatus = z.infer<typeof SetpointStatusSchema>;

/** Raison donnée par l'objet quand il n'applique pas tout ou partie d'une consigne. */
export const RejectionReasonSchema = z.enum([
  "battery_full",
  "battery_low",
  "charge_limit",
  "invalid_setpoint",
]);
export type RejectionReason = z.infer<typeof RejectionReasonSchema>;

/** Nature d'une alerte. */
export const AlertTypeSchema = z.enum([
  "low_production",
  "overheating",
  "battery_low",
  "battery_full",
  "setpoint_rejected",
  "setpoint_no_response",
  "device_offline",
]);
export type AlertType = z.infer<typeof AlertTypeSchema>;

/** Gravité d'une alerte ; seules `warning` et `critical` déclenchent une notification push. */
export const AlertSeveritySchema = z.enum(["info", "warning", "critical"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

/** État d'une alerte, résolue automatiquement quand sa condition disparaît. */
export const AlertStatusSchema = z.enum(["active", "resolved"]);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;
