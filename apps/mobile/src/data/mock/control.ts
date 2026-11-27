import {
  AUTOMATIC_CHARGE_TARGET_PCT,
  BATTERY_FULL_PCT,
  BATTERY_LOW_PCT,
  BATTERY_TIME_FACTOR,
  type ControlMode,
  type RejectionReason,
} from "@solar/contracts";

export type ControlInput = {
  mode: ControlMode;
  /** Part demandée vers la batterie (mode manuel), en %. */
  requestedShare: number | null;
  /** Production du site (W). */
  production: number;
  /** Niveau de batterie (%). */
  level: number;
  maxChargePowerW: number;
};

export type ControlOutput = {
  batteryPower: number;
  gridPower: number;
  appliedShare: number | null;
  status: "applied" | "partial" | "rejected";
  reason: RejectionReason | null;
};

/**
 * Algorithme de pilotage de l'objet (section 7 de docs/conception/02-uml.md), en fonction pure.
 * Même logique que le firmware et le mode « objet du site » du simulateur (#64).
 */
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

  if (mode === "manual" && (input.requestedShare === null || input.requestedShare % 10 !== 0)) {
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

  let batteryPower = (p * share) / 100;
  if (batteryPower > pmax) {
    batteryPower = pmax;
    const effective = p > 0 ? Math.round((pmax / p) * 100) : share;
    return {
      batteryPower,
      gridPower: p - batteryPower,
      appliedShare: effective,
      // En automatique, la limite de charge fait partie de la règle : la demande est respectée.
      status: mode === "manual" ? "partial" : "applied",
      reason: mode === "manual" ? "charge_limit" : null,
    };
  }
  return {
    batteryPower,
    gridPower: p - batteryPower,
    appliedShare: share,
    status: "applied",
    reason: null,
  };
}

/** Nouveau niveau de batterie après `seconds` secondes réelles (temps accéléré, facteur de la charte). */
export function nextBatteryLevel(
  level: number,
  batteryPower: number,
  seconds: number,
  capacityWh: number,
): number {
  const wh = (batteryPower * seconds * BATTERY_TIME_FACTOR) / 3600;
  return Math.max(0, Math.min(100, level + (wh / capacityWh) * 100));
}
