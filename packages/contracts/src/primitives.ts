// Briques de validation partagées par les messages MQTT et l'API REST.
import { z } from "zod";
import { BATTERY_SHARE_STEP_PCT } from "./constants";
import type { ControlMode } from "./enums";

/** Date ISO 8601 en UTC (suffixe `Z`). */
export const Iso8601UtcSchema = z.iso.datetime();

/** Pourcentage de 0 à 100. */
export const PercentSchema = z.number().min(0).max(100);

/** Température en °C, bornée comme en base. */
export const TemperatureSchema = z.number().min(-40).max(125);

/** Part de la production envoyée vers la batterie : entier de 0 à 100, multiple de 10. */
export const BatteryShareSchema = z
  .number()
  .int()
  .min(0)
  .max(100)
  .refine((value) => value % BATTERY_SHARE_STEP_PCT === 0, {
    message: `Doit être un multiple de ${BATTERY_SHARE_STEP_PCT}`,
  });

/**
 * Règle croisée d'une consigne : `batteryShare` est obligatoire en mode `manual`
 * et absente (ou `null`) dans les autres modes.
 */
export function checkBatteryShareForMode(
  setpoint: { mode: ControlMode; batteryShare?: number | null | undefined },
  ctx: z.RefinementCtx,
): void {
  const absent = setpoint.batteryShare === null || setpoint.batteryShare === undefined;
  if (setpoint.mode === "manual" && absent) {
    ctx.addIssue({
      code: "custom",
      path: ["batteryShare"],
      message: "batteryShare est obligatoire en mode manual",
    });
  }
  if (setpoint.mode !== "manual" && !absent) {
    ctx.addIssue({
      code: "custom",
      path: ["batteryShare"],
      message: "batteryShare doit être absente hors du mode manual",
    });
  }
}
