import { describe, expect, it } from "vitest";
import {
  ControlStateSchema,
  DEVICE_LAST_WILL,
  DeviceStatusSchema,
  PanelMeasurementSchema,
  SetpointSchema,
  SiteMeasurementSchema,
} from "../src/index";

// Exemples JSON de la section 6.2 de la cartographie technique.
const siteMeasurement = {
  v: 1,
  timestamp: "2026-11-20T10:15:05Z",
  irradiance: 820,
  production: 3150.5,
  temperature: 41.2,
  batteryLevel: 63.4,
  batteryPower: 2205.4,
  gridPower: 945.1,
  mode: "manual",
  simulatedFault: false,
};
const panelMeasurement = {
  v: 1,
  timestamp: "2026-11-20T10:15:10Z",
  production: 158.3,
  temperature: 40.8,
};
const setpoint = {
  v: 1,
  id: "0b8f3c1e-5d1a-4a53-9a0e-2f4b7c9d1e22",
  mode: "manual",
  batteryShare: 70,
  issuedAt: "2026-11-20T10:16:00Z",
};
const controlState = {
  v: 1,
  setpointId: "0b8f3c1e-5d1a-4a53-9a0e-2f4b7c9d1e22",
  mode: "manual",
  status: "partial",
  appliedBatteryShare: 55,
  reason: "charge_limit",
  timestamp: "2026-11-20T10:16:01Z",
};
const deviceStatus = { v: 1, status: "online", firmwareVersion: "0.1.0" };

describe("exemples de la section 6.2", () => {
  it("SiteMeasurement", () => {
    expect(SiteMeasurementSchema.safeParse(siteMeasurement).success).toBe(true);
  });
  it("PanelMeasurement", () => {
    expect(PanelMeasurementSchema.safeParse(panelMeasurement).success).toBe(true);
  });
  it("Setpoint", () => {
    expect(SetpointSchema.safeParse(setpoint).success).toBe(true);
  });
  it("ControlState", () => {
    expect(ControlStateSchema.safeParse(controlState).success).toBe(true);
  });
  it("DeviceStatus et Last Will", () => {
    expect(DeviceStatusSchema.safeParse(deviceStatus).success).toBe(true);
    expect(DeviceStatusSchema.safeParse(DEVICE_LAST_WILL).success).toBe(true);
  });
});

describe("version du format", () => {
  it.each([
    ["SiteMeasurement", SiteMeasurementSchema, siteMeasurement],
    ["PanelMeasurement", PanelMeasurementSchema, panelMeasurement],
    ["Setpoint", SetpointSchema, setpoint],
    ["ControlState", ControlStateSchema, controlState],
    ["DeviceStatus", DeviceStatusSchema, deviceStatus],
  ])("%s refuse v différent de 1", (_name, schema, example) => {
    expect(schema.safeParse({ ...example, v: 2 }).success).toBe(false);
    expect(schema.safeParse({ ...example, v: undefined }).success).toBe(false);
  });
});

describe("bornes de SiteMeasurement", () => {
  it.each([
    ["irradiance", -1],
    ["irradiance", 1501],
    ["production", -0.1],
    ["temperature", -40.1],
    ["temperature", 125.1],
    ["batteryLevel", -1],
    ["batteryLevel", 100.1],
    ["gridPower", -1],
  ])("refuse %s = %s", (field, value) => {
    expect(SiteMeasurementSchema.safeParse({ ...siteMeasurement, [field]: value }).success).toBe(
      false,
    );
  });

  it("accepte les valeurs limites et une décharge", () => {
    const limits = {
      ...siteMeasurement,
      irradiance: 1500,
      temperature: -40,
      batteryLevel: 100,
      batteryPower: -3000,
    };
    expect(SiteMeasurementSchema.safeParse(limits).success).toBe(true);
  });

  it("refuse un mode inconnu et un horodatage invalide", () => {
    expect(SiteMeasurementSchema.safeParse({ ...siteMeasurement, mode: "auto" }).success).toBe(
      false,
    );
    expect(SiteMeasurementSchema.safeParse({ ...siteMeasurement, timestamp: "hier" }).success).toBe(
      false,
    );
  });
});

describe("bornes de PanelMeasurement", () => {
  it("refuse une production négative et une température hors bornes", () => {
    expect(PanelMeasurementSchema.safeParse({ ...panelMeasurement, production: -1 }).success).toBe(
      false,
    );
    expect(
      PanelMeasurementSchema.safeParse({ ...panelMeasurement, temperature: 126 }).success,
    ).toBe(false);
  });
});

describe("Setpoint", () => {
  it("exige batteryShare en mode manual et null sinon", () => {
    expect(SetpointSchema.safeParse({ ...setpoint, batteryShare: null }).success).toBe(false);
    expect(
      SetpointSchema.safeParse({ ...setpoint, mode: "automatic", batteryShare: null }).success,
    ).toBe(true);
    expect(
      SetpointSchema.safeParse({ ...setpoint, mode: "discharge", batteryShare: 50 }).success,
    ).toBe(false);
  });

  it("refuse une part hors bornes ou non multiple de 10", () => {
    for (const batteryShare of [-10, 110, 55, 7.5]) {
      expect(SetpointSchema.safeParse({ ...setpoint, batteryShare }).success).toBe(false);
    }
    for (const batteryShare of [0, 10, 100]) {
      expect(SetpointSchema.safeParse({ ...setpoint, batteryShare }).success).toBe(true);
    }
  });

  it("refuse un identifiant qui n'est pas un UUID", () => {
    expect(SetpointSchema.safeParse({ ...setpoint, id: "abc" }).success).toBe(false);
  });
});

describe("ControlState", () => {
  it("accepte les valeurs nulles prévues", () => {
    const initial = {
      ...controlState,
      setpointId: null,
      mode: "discharge",
      status: "applied",
      appliedBatteryShare: null,
      reason: null,
    };
    expect(ControlStateSchema.safeParse(initial).success).toBe(true);
  });

  it("refuse un statut, une raison ou une part invalides", () => {
    expect(ControlStateSchema.safeParse({ ...controlState, status: "sent" }).success).toBe(false);
    expect(ControlStateSchema.safeParse({ ...controlState, reason: "autre" }).success).toBe(false);
    expect(
      ControlStateSchema.safeParse({ ...controlState, appliedBatteryShare: 101 }).success,
    ).toBe(false);
  });
});

describe("DeviceStatus", () => {
  it("accepte offline sans version et refuse unknown", () => {
    expect(DeviceStatusSchema.safeParse({ v: 1, status: "offline" }).success).toBe(true);
    expect(DeviceStatusSchema.safeParse({ v: 1, status: "unknown" }).success).toBe(false);
  });
});
