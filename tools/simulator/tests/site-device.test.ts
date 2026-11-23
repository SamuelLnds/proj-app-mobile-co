import {
  ControlStateSchema,
  SetpointSchema,
  SiteMeasurementSchema,
  type Setpoint,
} from "@solar/contracts";
import { describe, expect, it } from "vitest";
import { SiteDevice } from "../src/device/site-device";

const NOW = new Date("2026-01-01T10:00:00.000Z");

function setpoint(overrides: Partial<Setpoint> = {}): Setpoint {
  return SetpointSchema.parse({
    v: 1,
    id: "0b9d6c1e-6a3f-4f43-9d0e-3f6c8f7a2b11",
    mode: "manual",
    batteryShare: 50,
    issuedAt: NOW.toISOString(),
    ...overrides,
  });
}

describe("SiteDevice", () => {
  it("publie des mesures conformes au schéma SiteMeasurement", () => {
    const device = new SiteDevice();
    for (let i = 0; i < 1500; i += 1) {
      device.tick(1, NOW);
      expect(SiteMeasurementSchema.safeParse(device.measurement(NOW)).success).toBe(true);
    }
  });

  it("publie un état initial conforme à ControlState, sans consigne reçue", () => {
    const state = new SiteDevice().controlState(NOW);
    expect(ControlStateSchema.parse(state)).toMatchObject({
      setpointId: null,
      mode: "automatic",
    });
  });

  it("répond à une consigne par un état qui référence son identifiant", () => {
    const device = new SiteDevice();
    const state = device.receiveSetpoint(setpoint(), NOW);
    expect(ControlStateSchema.safeParse(state).success).toBe(true);
    expect(state).toMatchObject({
      setpointId: "0b9d6c1e-6a3f-4f43-9d0e-3f6c8f7a2b11",
      mode: "manual",
      status: "applied",
      appliedBatteryShare: 50,
      reason: null,
    });
    expect(device.measurement(NOW).mode).toBe("manual");
  });

  it("rejette une restitution quand la batterie est basse (battery_low)", () => {
    const device = new SiteDevice(20);
    const state = device.receiveSetpoint(setpoint({ mode: "discharge", batteryShare: null }), NOW);
    expect(state).toMatchObject({ status: "rejected", reason: "battery_low" });
    expect(state.appliedBatteryShare).toBeNull();
  });

  it("rejette une charge manuelle quand la batterie est pleine (battery_full)", () => {
    const device = new SiteDevice(96);
    const state = device.receiveSetpoint(setpoint({ batteryShare: 100 }), NOW);
    expect(state).toMatchObject({
      status: "rejected",
      reason: "battery_full",
      appliedBatteryShare: 0,
    });
  });

  it("ne republie pas l'état tant que rien ne change, puis le publie au changement", () => {
    const device = new SiteDevice(70);
    device.receiveSetpoint(setpoint({ mode: "automatic", batteryShare: null }), NOW);
    // En automatique, la charge à 100 % se poursuit sans nouvel état jusqu'à 80 %.
    expect(device.tick(1, NOW)).toBeNull();
    let changed = null;
    for (let i = 0; i < 60 && !changed; i += 1) changed = device.tick(1, NOW);
    expect(changed).not.toBeNull();
    expect(ControlStateSchema.safeParse(changed).success).toBe(true);
    expect(changed).toMatchObject({ appliedBatteryShare: 0, status: "applied" });
  });
});
