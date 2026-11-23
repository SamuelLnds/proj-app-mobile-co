import { DEMO_SITE_PEAK_POWER_W } from "@solar/contracts";
import { describe, expect, it } from "vitest";
import {
  irradianceAt,
  PEAK_IRRADIANCE_W_M2,
  productionFor,
  simulatedHour,
  temperatureFor,
} from "../src/device/sun";

describe("simulatedHour", () => {
  it("démarre à l'heure de départ et avance d'une minute simulée par seconde réelle", () => {
    expect(simulatedHour(0, 9)).toBe(9);
    expect(simulatedHour(60, 9)).toBe(10);
  });

  it("revient à minuit après un jour simulé (24 minutes réelles)", () => {
    expect(simulatedHour(24 * 60, 9)).toBeCloseTo(9);
  });
});

describe("irradianceAt", () => {
  it("est nulle la nuit", () => {
    expect(irradianceAt(0)).toBe(0);
    expect(irradianceAt(3)).toBe(0);
    expect(irradianceAt(22)).toBe(0);
  });

  it("culmine au milieu de la journée", () => {
    expect(irradianceAt(13)).toBeCloseTo(PEAK_IRRADIANCE_W_M2);
    expect(irradianceAt(10)).toBeLessThan(irradianceAt(13));
    expect(irradianceAt(17)).toBeLessThan(irradianceAt(13));
  });
});

describe("production et température", () => {
  it("la production au zénith vaut la puissance crête du site de démonstration", () => {
    expect(productionFor(PEAK_IRRADIANCE_W_M2)).toBe(DEMO_SITE_PEAK_POWER_W);
  });

  it("la température monte avec l'ensoleillement", () => {
    expect(temperatureFor(1000)).toBeGreaterThan(temperatureFor(0));
  });
});
