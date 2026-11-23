import { DEMO_SITE_MAX_CHARGE_POWER_W } from "@solar/contracts";
import { describe, expect, it } from "vitest";
import { applyControl, nextBatteryLevel, type ControlInput } from "../src/device/control";

const PMAX = DEMO_SITE_MAX_CHARGE_POWER_W;

/** Entrée de référence : mode manuel à 50 %, production de 2000 W, batterie à 50 %. */
function input(overrides: Partial<ControlInput> = {}): ControlInput {
  return {
    mode: "manual",
    requestedShare: 50,
    production: 2000,
    level: 50,
    maxChargePowerW: PMAX,
    ...overrides,
  };
}

// Une série de tests par ligne du tableau « statut renvoyé » (section 7 de 02-uml.md).
describe("applyControl : tableau « statut renvoyé »", () => {
  it("consigne mal formée ou hors bornes : rejected, part null, invalid_setpoint", () => {
    for (const requestedShare of [null, 15, -10, 110, 12.5]) {
      const result = applyControl(input({ requestedShare }));
      expect(result).toMatchObject({
        status: "rejected",
        appliedShare: null,
        reason: "invalid_setpoint",
        batteryPower: 0,
        gridPower: 2000,
      });
    }
  });

  it("manuel, demande appliquée en entier : applied, part appliquée, sans raison", () => {
    const result = applyControl(input());
    expect(result).toEqual({
      batteryPower: 1000,
      gridPower: 1000,
      appliedShare: 50,
      status: "applied",
      reason: null,
    });
  });

  it("automatique sous 80 % : applied avec 100 %", () => {
    const result = applyControl(input({ mode: "automatic", requestedShare: null, level: 79 }));
    expect(result).toMatchObject({ status: "applied", appliedShare: 100, reason: null });
    expect(result.batteryPower).toBe(2000);
  });

  it("automatique à 80 % ou plus : applied avec 0 %", () => {
    const result = applyControl(input({ mode: "automatic", requestedShare: null, level: 80 }));
    expect(result).toMatchObject({ status: "applied", appliedShare: 0, reason: null });
    expect(result.batteryPower).toBe(0);
    expect(result.gridPower).toBe(2000);
  });

  it("manuel, part réduite par la puissance de charge maximale : partial, part arrondie, charge_limit", () => {
    const result = applyControl(input({ requestedShare: 100, production: 4000 }));
    expect(result).toEqual({
      batteryPower: PMAX,
      gridPower: 1000,
      appliedShare: 75,
      status: "partial",
      reason: "charge_limit",
    });
  });

  it("manuel avec part > 0, batterie à 95 % ou plus : rejected, part 0, battery_full", () => {
    const result = applyControl(input({ level: 95 }));
    expect(result).toEqual({
      batteryPower: 0,
      gridPower: 2000,
      appliedShare: 0,
      status: "rejected",
      reason: "battery_full",
    });
  });

  it("manuel avec part 0 et batterie pleine : appliqué (rien à charger)", () => {
    const result = applyControl(input({ requestedShare: 0, level: 100 }));
    expect(result).toMatchObject({ status: "applied", appliedShare: 0, reason: null });
  });

  it("restitution avec batterie à 20 % ou moins : rejected, part null, battery_low", () => {
    const result = applyControl(input({ mode: "discharge", requestedShare: null, level: 20 }));
    expect(result).toEqual({
      batteryPower: 0,
      gridPower: 2000,
      appliedShare: null,
      status: "rejected",
      reason: "battery_low",
    });
  });

  it("restitution avec batterie au-dessus de 20 % : applied, part null, sans raison", () => {
    const result = applyControl(input({ mode: "discharge", requestedShare: null, level: 21 }));
    expect(result).toEqual({
      batteryPower: -PMAX,
      gridPower: 2000 + PMAX,
      appliedShare: null,
      status: "applied",
      reason: null,
    });
  });

  it("production nulle (nuit) : la part demandée est considérée comme appliquée", () => {
    const result = applyControl(input({ requestedShare: 100, production: 0 }));
    expect(result).toEqual({
      batteryPower: 0,
      gridPower: 0,
      appliedShare: 100,
      status: "applied",
      reason: null,
    });
  });
});

describe("applyControl : automatique et limite de charge", () => {
  it("la limite de charge fait partie de la règle : applied avec 100 %, sans raison", () => {
    const result = applyControl(
      input({ mode: "automatic", requestedShare: null, production: 4000, level: 10 }),
    );
    expect(result).toEqual({
      batteryPower: PMAX,
      gridPower: 1000,
      appliedShare: 100,
      status: "applied",
      reason: null,
    });
  });
});

describe("nextBatteryLevel", () => {
  it("charge en temps accéléré (1 s réelle = 1 min simulée)", () => {
    // 3000 W pendant 1 s réelle = 3000 Wh/h * 1 min = 50 Wh sur 10 000 Wh = 0,5 %.
    expect(nextBatteryLevel(50, 3000, 1, 10_000)).toBeCloseTo(50.5);
  });

  it("décharge et borne entre 0 et 100", () => {
    expect(nextBatteryLevel(50, -3000, 1, 10_000)).toBeCloseTo(49.5);
    expect(nextBatteryLevel(0.1, -3000, 10, 10_000)).toBe(0);
    expect(nextBatteryLevel(99.9, 3000, 10, 10_000)).toBe(100);
  });

  it("passe de 20 % à 95 % en 2 à 3 minutes réelles à pleine puissance de charge", () => {
    let level = 20;
    let seconds = 0;
    while (level < 95) {
      level = nextBatteryLevel(level, PMAX, 1, 10_000);
      seconds += 1;
    }
    expect(seconds).toBeGreaterThanOrEqual(120);
    expect(seconds).toBeLessThanOrEqual(180);
  });
});
