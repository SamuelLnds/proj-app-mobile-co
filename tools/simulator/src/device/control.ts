// Algorithme de pilotage de l'objet (section 7 de docs/conception/02-uml.md), en fonctions pures.
// Aucune entrée-sortie : le simulateur et, plus tard, le firmware s'alignent sur ce comportement.
import {
  AUTOMATIC_CHARGE_TARGET_PCT,
  BATTERY_FULL_PCT,
  BATTERY_LOW_PCT,
  BATTERY_SHARE_STEP_PCT,
  BATTERY_TIME_FACTOR,
  type ControlMode,
  type ControlResult,
  type RejectionReason,
} from "@solar/contracts";

export type ControlInput = {
  mode: ControlMode;
  /** Part demandée vers la batterie (mode manuel), en % ; `null` hors du mode manuel. */
  requestedShare: number | null;
  /** Production du site (W). */
  production: number;
  /** Niveau de la batterie (%). */
  level: number;
  /** Puissance de charge maximale (W). */
  maxChargePowerW: number;
};

export type ControlOutput = {
  /** Puissance de la batterie (W) : positif = charge, négatif = décharge. */
  batteryPower: number;
  /** Puissance injectée sur le réseau (W). */
  gridPower: number;
  /** Part effectivement appliquée (`null` en restitution ou si la consigne est invalide). */
  appliedShare: number | null;
  status: ControlResult;
  reason: RejectionReason | null;
};

/** Une part valide est un entier de 0 à 100, multiple du pas de la charte. */
function isValidShare(share: number | null): share is number {
  return (
    share !== null &&
    Number.isInteger(share) &&
    share >= 0 &&
    share <= 100 &&
    share % BATTERY_SHARE_STEP_PCT === 0
  );
}

/** Calcule les flux et le statut pour un tick, selon le mode en vigueur. */
export function applyControl(input: ControlInput): ControlOutput {
  const { mode, production: p, level, maxChargePowerW: pmax } = input;

  if (mode === "discharge") {
    if (level > BATTERY_LOW_PCT) {
      return {
        batteryPower: -pmax,
        gridPower: p + pmax,
        appliedShare: null,
        status: "applied",
        reason: null,
      };
    }
    return {
      batteryPower: 0,
      gridPower: p,
      appliedShare: null,
      status: "rejected",
      reason: "battery_low",
    };
  }

  if (mode === "manual" && !isValidShare(input.requestedShare)) {
    return {
      batteryPower: 0,
      gridPower: p,
      appliedShare: null,
      status: "rejected",
      reason: "invalid_setpoint",
    };
  }

  const share =
    mode === "automatic" ? (level < AUTOMATIC_CHARGE_TARGET_PCT ? 100 : 0) : input.requestedShare!;

  if (share > 0 && level >= BATTERY_FULL_PCT) {
    return {
      batteryPower: 0,
      gridPower: p,
      appliedShare: 0,
      status: "rejected",
      reason: "battery_full",
    };
  }

  const wanted = (p * share) / 100;
  if (wanted > pmax) {
    // Ici p > 0 (car wanted > pmax > 0) : la division est sûre.
    const effectiveShare = Math.round((pmax / p) * 100);
    // En automatique, la limite de charge fait partie de la règle : la demande est respectée.
    return mode === "manual"
      ? {
          batteryPower: pmax,
          gridPower: p - pmax,
          appliedShare: effectiveShare,
          status: "partial",
          reason: "charge_limit",
        }
      : {
          batteryPower: pmax,
          gridPower: p - pmax,
          appliedShare: share,
          status: "applied",
          reason: null,
        };
  }

  return {
    batteryPower: wanted,
    gridPower: p - wanted,
    appliedShare: share,
    status: "applied",
    reason: null,
  };
}

/** Nouveau niveau de batterie (%) après `seconds` secondes réelles, en temps accéléré, borné à 0-100. */
export function nextBatteryLevel(
  level: number,
  batteryPower: number,
  seconds: number,
  capacityWh: number,
): number {
  const wh = (batteryPower * seconds * BATTERY_TIME_FACTOR) / 3600;
  return Math.max(0, Math.min(100, level + (wh / capacityWh) * 100));
}
