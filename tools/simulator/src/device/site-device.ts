// Modèle de l'objet du site : consigne en vigueur, batterie, état appliqué et mesures.
// Aucune entrée-sortie ni horloge système : le temps est fourni par l'appelant, ce qui rend le modèle testable.
import {
  DEMO_SITE_BATTERY_CAPACITY_WH,
  DEMO_SITE_MAX_CHARGE_POWER_W,
  MESSAGE_VERSION,
  type ControlMode,
  type ControlState,
  type Setpoint,
  type SiteMeasurement,
} from "@solar/contracts";
import { applyControl, nextBatteryLevel, type ControlOutput } from "./control";
import { irradianceAt, productionFor, simulatedHour, temperatureFor } from "./sun";

/** Niveau de batterie au démarrage de l'objet (%). */
export const INITIAL_BATTERY_LEVEL_PCT = 50;

/** Arrondit à une décimale pour garder des messages lisibles. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Ce qui, dans l'état appliqué, déclenche une nouvelle publication quand cela change. */
type Signature = Pick<ControlOutput, "status" | "appliedShare" | "reason">;

export class SiteDevice {
  private mode: ControlMode = "automatic";
  private requestedShare: number | null = null;
  private setpointId: string | null = null;
  private level = INITIAL_BATTERY_LEVEL_PCT;
  private elapsedS = 0;
  private output: ControlOutput;
  private lastPublished: Signature;

  constructor(initialLevel: number = INITIAL_BATTERY_LEVEL_PCT) {
    this.level = initialLevel;
    this.output = this.compute();
    this.lastPublished = this.signature();
  }

  /** Flux et statut du tick courant, d'après l'ensoleillement simulé et le niveau de batterie. */
  private compute(): ControlOutput {
    const production = productionFor(irradianceAt(simulatedHour(this.elapsedS)));
    return applyControl({
      mode: this.mode,
      requestedShare: this.requestedShare,
      production,
      level: this.level,
      maxChargePowerW: DEMO_SITE_MAX_CHARGE_POWER_W,
    });
  }

  private signature(): Signature {
    const { status, appliedShare, reason } = this.output;
    return { status, appliedShare, reason };
  }

  /** État appliqué à publier (retained). */
  controlState(now: Date): ControlState {
    return {
      v: MESSAGE_VERSION,
      setpointId: this.setpointId,
      mode: this.mode,
      status: this.output.status,
      appliedBatteryShare: this.output.appliedShare,
      reason: this.output.reason,
      timestamp: now.toISOString(),
    };
  }

  /** Adopte une consigne valide ; l'état à publier est le premier calculé avec elle. */
  receiveSetpoint(setpoint: Setpoint, now: Date): ControlState {
    this.mode = setpoint.mode;
    this.requestedShare = setpoint.batteryShare;
    this.setpointId = setpoint.id;
    this.output = this.compute();
    this.lastPublished = this.signature();
    return this.controlState(now);
  }

  /**
   * Avance d'un tick de `seconds` secondes réelles : met à jour la batterie, recalcule les flux,
   * et renvoie l'état à publier si la part appliquée, le statut ou la raison a changé.
   */
  tick(seconds: number, now: Date): ControlState | null {
    this.level = nextBatteryLevel(
      this.level,
      this.output.batteryPower,
      seconds,
      DEMO_SITE_BATTERY_CAPACITY_WH,
    );
    this.elapsedS += seconds;
    this.output = this.compute();

    const current = this.signature();
    const last = this.lastPublished;
    if (
      current.status === last.status &&
      current.appliedShare === last.appliedShare &&
      current.reason === last.reason
    ) {
      return null;
    }
    this.lastPublished = current;
    return this.controlState(now);
  }

  /** Mesure du site à publier. */
  measurement(now: Date): SiteMeasurement {
    const irradiance = irradianceAt(simulatedHour(this.elapsedS));
    return {
      v: MESSAGE_VERSION,
      timestamp: now.toISOString(),
      irradiance: round1(irradiance),
      production: round1(productionFor(irradiance)),
      temperature: round1(temperatureFor(irradiance)),
      batteryLevel: round1(this.level),
      batteryPower: round1(this.output.batteryPower),
      gridPower: round1(this.output.gridPower),
      mode: this.mode,
      simulatedFault: false,
    };
  }
}
