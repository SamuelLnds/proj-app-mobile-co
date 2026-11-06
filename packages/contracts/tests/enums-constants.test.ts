import { describe, expect, it } from "vitest";
import * as contracts from "../src/index";

describe("enums", () => {
  it("reprennent exactement les valeurs de la base", () => {
    expect(contracts.UserRoleSchema.options).toEqual(["operator", "viewer"]);
    expect(contracts.MobilePlatformSchema.options).toEqual(["android", "ios"]);
    expect(contracts.DeviceStatusValueSchema.options).toEqual(["unknown", "online", "offline"]);
    expect(contracts.PanelSourceSchema.options).toEqual(["seed", "discovered", "manual"]);
    expect(contracts.ControlModeSchema.options).toEqual(["manual", "automatic", "discharge"]);
    expect(contracts.SetpointStatusSchema.options).toEqual([
      "sent",
      "applied",
      "partial",
      "rejected",
      "no_response",
    ]);
    expect(contracts.RejectionReasonSchema.options).toEqual([
      "battery_full",
      "battery_low",
      "charge_limit",
      "invalid_setpoint",
    ]);
    expect(contracts.AlertTypeSchema.options).toEqual([
      "low_production",
      "overheating",
      "battery_low",
      "battery_full",
      "setpoint_rejected",
      "setpoint_no_response",
      "device_offline",
    ]);
    expect(contracts.AlertSeveritySchema.options).toEqual(["info", "warning", "critical"]);
    expect(contracts.AlertStatusSchema.options).toEqual(["active", "resolved"]);
  });

  it("refusent une valeur inconnue", () => {
    expect(contracts.ControlModeSchema.safeParse("auto").success).toBe(false);
  });
});

describe("constantes", () => {
  it("portent les noms et valeurs de la cartographie", () => {
    expect({
      SITE_MEASUREMENT_PERIOD_S: contracts.SITE_MEASUREMENT_PERIOD_S,
      PANEL_MEASUREMENT_PERIOD_S: contracts.PANEL_MEASUREMENT_PERIOD_S,
      SETPOINT_RESPONSE_TIMEOUT_S: contracts.SETPOINT_RESPONSE_TIMEOUT_S,
      DEVICE_SILENCE_TIMEOUT_S: contracts.DEVICE_SILENCE_TIMEOUT_S,
      PANEL_NO_DATA_TIMEOUT_S: contracts.PANEL_NO_DATA_TIMEOUT_S,
      MAX_CLOCK_DRIFT_S: contracts.MAX_CLOCK_DRIFT_S,
      BATTERY_TIME_FACTOR: contracts.BATTERY_TIME_FACTOR,
      BATTERY_FULL_PCT: contracts.BATTERY_FULL_PCT,
      BATTERY_FULL_RESOLVED_PCT: contracts.BATTERY_FULL_RESOLVED_PCT,
      BATTERY_LOW_PCT: contracts.BATTERY_LOW_PCT,
      BATTERY_LOW_RESOLVED_PCT: contracts.BATTERY_LOW_RESOLVED_PCT,
      AUTOMATIC_CHARGE_TARGET_PCT: contracts.AUTOMATIC_CHARGE_TARGET_PCT,
      OVERHEATING_C: contracts.OVERHEATING_C,
      OVERHEATING_RESOLVED_C: contracts.OVERHEATING_RESOLVED_C,
      LOW_PRODUCTION_RATIO: contracts.LOW_PRODUCTION_RATIO,
      LOW_PRODUCTION_RESOLVED_RATIO: contracts.LOW_PRODUCTION_RESOLVED_RATIO,
      MIN_IRRADIANCE_FOR_ALERT_W_M2: contracts.MIN_IRRADIANCE_FOR_ALERT_W_M2,
      LOW_PRODUCTION_DURATION_S: contracts.LOW_PRODUCTION_DURATION_S,
      BATTERY_SHARE_STEP_PCT: contracts.BATTERY_SHARE_STEP_PCT,
      DEFAULT_PANEL_RATED_POWER_W: contracts.DEFAULT_PANEL_RATED_POWER_W,
      MAX_PANELS_PER_SITE: contracts.MAX_PANELS_PER_SITE,
    }).toEqual({
      SITE_MEASUREMENT_PERIOD_S: 5,
      PANEL_MEASUREMENT_PERIOD_S: 10,
      SETPOINT_RESPONSE_TIMEOUT_S: 30,
      DEVICE_SILENCE_TIMEOUT_S: 60,
      PANEL_NO_DATA_TIMEOUT_S: 60,
      MAX_CLOCK_DRIFT_S: 300,
      BATTERY_TIME_FACTOR: 60,
      BATTERY_FULL_PCT: 95,
      BATTERY_FULL_RESOLVED_PCT: 90,
      BATTERY_LOW_PCT: 20,
      BATTERY_LOW_RESOLVED_PCT: 25,
      AUTOMATIC_CHARGE_TARGET_PCT: 80,
      OVERHEATING_C: 75,
      OVERHEATING_RESOLVED_C: 70,
      LOW_PRODUCTION_RATIO: 0.7,
      LOW_PRODUCTION_RESOLVED_RATIO: 0.8,
      MIN_IRRADIANCE_FOR_ALERT_W_M2: 100,
      LOW_PRODUCTION_DURATION_S: 60,
      BATTERY_SHARE_STEP_PCT: 10,
      DEFAULT_PANEL_RATED_POWER_W: 200,
      MAX_PANELS_PER_SITE: 200,
    });
  });
});
