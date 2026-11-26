import { MAX_PANELS_PER_SITE, MESSAGE_VERSION, type PanelMeasurement } from "@solar/contracts";
import type { FastifyBaseLogger } from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { MeasurementsRepository, PanelMeasurementRow } from "./repository";
import { createMeasurementsService } from "./service";

const SITE_ID = "00000000-0000-4000-8000-000000000001";

/** Faux dépôt : la création d'un panneau respecte l'unicité (site, code), comme la base. */
function setup(existingPanels: string[] = ["P01"]) {
  const panels = new Map<string, { id: string; source: string }>();
  for (const code of existingPanels) panels.set(code, { id: `id-${code}`, source: "seed" });
  const rows: PanelMeasurementRow[] = [];
  let creations = 0;
  const repository: MeasurementsRepository = {
    findSiteIdByCode: async (code) => (code === "SITE01" ? SITE_ID : null),
    insertSiteMeasurement: async () => {},
    findPanelId: async (_siteId, code) => panels.get(code)?.id ?? null,
    countPanels: async () => panels.size,
    createDiscoveredPanel: async (_siteId, code) => {
      // Laisse les appels simultanés se croiser avant l'insertion.
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (!panels.has(code)) {
        creations++;
        panels.set(code, { id: `id-${code}`, source: "discovered" });
      }
      return panels.get(code)!.id;
    },
    insertPanelMeasurement: async (row) => {
      rows.push(row);
    },
  };
  const logger = { warn: vi.fn(), info: vi.fn() } as unknown as FastifyBaseLogger & {
    warn: ReturnType<typeof vi.fn>;
  };
  return {
    service: createMeasurementsService(repository, logger),
    panels,
    rows,
    logger,
    creations: () => creations,
  };
}

const message: PanelMeasurement = {
  v: MESSAGE_VERSION,
  timestamp: "2026-11-26T10:00:00Z",
  production: 160,
  temperature: 35,
};
const receivedAt = new Date("2026-11-26T10:00:01Z");

describe("enregistrement des mesures des panneaux", () => {
  it("insère la mesure d'un panneau connu", async () => {
    const { service, rows } = setup();
    await service.recordPanelMeasurement("SITE01", "P01", message, receivedAt);
    expect(rows).toEqual([
      {
        time: new Date("2026-11-26T10:00:00Z"),
        panelId: "id-P01",
        productionW: 160,
        temperatureC: 35,
      },
    ]);
  });

  it("crée une seule fois un panneau inconnu, même pour des messages simultanés", async () => {
    const { service, panels, rows, creations } = setup();
    await Promise.all(
      Array.from({ length: 3 }, () =>
        service.recordPanelMeasurement("SITE01", "P21", message, receivedAt),
      ),
    );
    expect(creations()).toBe(1);
    expect(panels.get("P21")?.source).toBe("discovered");
    expect(rows.filter((r) => r.panelId === "id-P21")).toHaveLength(3);
  });

  it("ignore et journalise un nouveau panneau au-delà de la limite par site", async () => {
    const codes = Array.from(
      { length: MAX_PANELS_PER_SITE },
      (_, i) => `P${String(i + 1).padStart(3, "0")}`,
    );
    const { service, panels, rows, logger } = setup(codes);
    await service.recordPanelMeasurement("SITE01", "P999", message, receivedAt);
    expect(panels.has("P999")).toBe(false);
    expect(rows).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("ignore et journalise la mesure d'un site inconnu", async () => {
    const { service, rows, logger, creations } = setup();
    await service.recordPanelMeasurement("SITE99", "P01", message, receivedAt);
    expect(rows).toHaveLength(0);
    expect(creations()).toBe(0);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("recrée comme détecté un panneau supprimé qui publie de nouveau", async () => {
    const { service, panels } = setup();
    panels.delete("P01");
    await service.recordPanelMeasurement("SITE01", "P01", message, receivedAt);
    expect(panels.get("P01")?.source).toBe("discovered");
  });
});
