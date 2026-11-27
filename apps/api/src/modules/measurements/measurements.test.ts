import { MAX_CLOCK_DRIFT_S, MESSAGE_VERSION, type SiteMeasurement } from "@solar/contracts";
import type { FastifyBaseLogger } from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { MeasurementsRepository, SiteMeasurementRow } from "./repository";
import { createMeasurementsService, measurementTime } from "./service";

const SITE_ID = "00000000-0000-4000-8000-000000000001";

function setup(knownCodes: Record<string, string> = { SITE01: SITE_ID }) {
  const rows: SiteMeasurementRow[] = [];
  const touched: { siteId: string; seenAt: Date }[] = [];
  const repository: MeasurementsRepository = {
    findSiteIdByCode: async (code) => knownCodes[code] ?? null,
    findPanelId: async () => null,
    countPanels: async () => 0,
    createDiscoveredPanel: async () => "",
    insertPanelMeasurement: async () => {},
    insertSiteMeasurement: async (row) => {
      rows.push(row);
    },
  };
  const logger = { warn: vi.fn() } as unknown as FastifyBaseLogger & {
    warn: ReturnType<typeof vi.fn>;
  };
  const recordActivity = async (siteId: string, seenAt: Date) => {
    touched.push({ siteId, seenAt });
  };
  return {
    service: createMeasurementsService(repository, logger, recordActivity),
    rows,
    touched,
    logger,
  };
}

function message(timestamp: string): SiteMeasurement {
  return {
    v: MESSAGE_VERSION,
    timestamp,
    irradiance: 800,
    production: 3200,
    temperature: 31.5,
    batteryLevel: 62,
    batteryPower: 900,
    gridPower: 2300,
    mode: "manual",
    simulatedFault: false,
  };
}

const receivedAt = new Date("2026-11-23T10:00:02Z");

describe("enregistrement d'une mesure du site", () => {
  it("insère la mesure avec l'horodatage de l'objet et met à jour l'objet", async () => {
    const { service, rows, touched, logger } = setup();
    await service.recordSiteMeasurement("SITE01", message("2026-11-23T10:00:00Z"), receivedAt);
    expect(rows).toEqual([
      {
        time: new Date("2026-11-23T10:00:00Z"),
        siteId: SITE_ID,
        irradianceWM2: 800,
        productionW: 3200,
        temperatureC: 31.5,
        batteryLevelPct: 62,
        batteryPowerW: 900,
        gridPowerW: 2300,
        mode: "manual",
        simulatedFault: false,
      },
    ]);
    expect(touched).toEqual([{ siteId: SITE_ID, seenAt: receivedAt }]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("remplace un horodatage trop décalé par l'heure de réception", async () => {
    const { service, rows, logger } = setup();
    await service.recordSiteMeasurement("SITE01", message("2026-11-23T09:50:00Z"), receivedAt);
    expect(rows[0]?.time).toBe(receivedAt);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("ignore et journalise une mesure d'un site inconnu", async () => {
    const { service, rows, touched, logger } = setup();
    await service.recordSiteMeasurement("SITE99", message("2026-11-23T10:00:00Z"), receivedAt);
    expect(rows).toHaveLength(0);
    expect(touched).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});

describe("measurementTime", () => {
  it("garde l'horodatage jusqu'à l'écart maximal inclus", () => {
    const limit = new Date(receivedAt.getTime() - MAX_CLOCK_DRIFT_S * 1000).toISOString();
    expect(measurementTime(limit, receivedAt).toISOString()).toBe(limit);
  });

  it("utilise l'heure de réception au-delà, dans les deux sens", () => {
    const ahead = new Date(receivedAt.getTime() + (MAX_CLOCK_DRIFT_S + 1) * 1000).toISOString();
    expect(measurementTime(ahead, receivedAt)).toBe(receivedAt);
  });
});
