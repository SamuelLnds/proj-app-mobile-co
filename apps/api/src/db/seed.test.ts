import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEMO_SITE_BATTERY_CAPACITY_WH,
  DEMO_SITE_MAX_CHARGE_POWER_W,
  DEMO_SITE_PEAK_POWER_W,
  DEMO_SITE_PRODUCTION_FACTOR,
} from "@solar/contracts";
import { parseDemoSiteFile } from "./seed-schema";

const file = fileURLToPath(new URL("../../../../infra/seed/demo-site.json", import.meta.url));
const raw: unknown = JSON.parse(readFileSync(file, "utf8"));

describe("infra/seed/demo-site.json", () => {
  it("est valide et reprend les valeurs de la section 8 du modèle de données", () => {
    const data = parseDemoSiteFile(raw);
    expect(data.site).toMatchObject({
      code: "SITE01",
      name: "Parc solaire de démonstration",
      latitude: 47.25,
      longitude: -1.55,
      peakPowerW: DEMO_SITE_PEAK_POWER_W,
      batteryCapacityWh: DEMO_SITE_BATTERY_CAPACITY_WH,
      maxChargePowerW: DEMO_SITE_MAX_CHARGE_POWER_W,
      productionFactor: DEMO_SITE_PRODUCTION_FACTOR,
    });
    expect(data.device.mqttClientId).toBe("device-site01");
  });

  it("contient 20 panneaux P01 à P20 de 200 W, source seed, en 4 rangées de 5", () => {
    const { panels } = parseDemoSiteFile(raw);
    expect(panels.map((p) => p.code)).toEqual(
      Array.from({ length: 20 }, (_, i) => `P${String(i + 1).padStart(2, "0")}`),
    );
    expect(panels.every((p) => p.ratedPowerW === 200 && p.source === "seed")).toBe(true);
    const rows = new Set(panels.map((p) => p.latitude));
    expect(rows.size).toBe(4);
  });

  it("refuse un fichier invalide avec une erreur explicite", () => {
    const broken = structuredClone(raw) as { panels: { code: string; source: string }[] };
    broken.panels[0]!.code = "X1";
    broken.panels[1]!.source = "manual";
    expect(() => parseDemoSiteFile(broken)).toThrow(/panels\.0\.code/);
    expect(() => parseDemoSiteFile(broken)).toThrow(/panels\.1\.source/);
  });

  it("refuse deux panneaux de même code", () => {
    const broken = structuredClone(raw) as { panels: { code: string }[] };
    broken.panels[1]!.code = broken.panels[0]!.code;
    expect(() => parseDemoSiteFile(broken)).toThrow(/uniques/);
  });
});
