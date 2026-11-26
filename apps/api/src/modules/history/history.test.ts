import { ErrorResponseSchema, SiteMeasurementSeriesSchema } from "@solar/contracts";
import { describe, expect, it } from "vitest";
import { createDb, type Database } from "../../db/client";
import { siteMeasurements, sites } from "../../db/schema";
import { buildServer } from "../../server";
import { createHistoryRepository, type HistoryRepository, type SitePointRow } from "./repository";
import { createHistoryService } from "./service";

const SITE_ID = "00000000-0000-4000-8000-000000000001";

function point(minute: number, production: number): SitePointRow {
  return {
    time: new Date(`2026-11-26T10:${String(minute).padStart(2, "0")}:00Z`),
    irradiance: production / 4,
    production,
    temperature: 30,
    batteryLevel: 60,
    batteryPower: 100,
    gridPower: production - 100,
  };
}

function server(rows: SitePointRow[] = []) {
  const repository: HistoryRepository = {
    siteExists: async (id) => id === SITE_ID,
    panelExists: async () => false,
    sitePoints: async () => rows,
    panelPoints: async () => [],
  };
  return buildServer({
    config: { LOG_LEVEL: "silent", NODE_ENV: "test" },
    checkDatabase: async () => true,
    history: createHistoryService(repository),
  });
}

const url = (query: string, id = SITE_ID) => `/v1/sites/${id}/measurements?${query}`;
const code = (response: { json: () => unknown }) =>
  ErrorResponseSchema.parse(response.json()).error.code;

describe("GET /v1/sites/{id}/measurements", () => {
  it("renvoie les points au format attendu", async () => {
    const response = await server([point(0, 1000), point(1, 1200)]).inject({
      url: url("from=2026-11-26T10:00:00Z&to=2026-11-26T11:00:00Z&interval=1m"),
    });
    expect(response.statusCode).toBe(200);
    const series = SiteMeasurementSeriesSchema.parse(response.json());
    expect(series.map((p) => [p.time, p.production])).toEqual([
      ["2026-11-26T10:00:00.000Z", 1000],
      ["2026-11-26T10:01:00.000Z", 1200],
    ]);
  });

  it.each([
    ["écart de plus de 7 jours", "from=2026-11-01T00:00:00Z&to=2026-11-26T00:00:00Z&interval=1h"],
    ["intervalle inconnu", "from=2026-11-26T10:00:00Z&to=2026-11-26T11:00:00Z&interval=2m"],
    ["to avant from", "from=2026-11-26T11:00:00Z&to=2026-11-26T10:00:00Z&interval=1m"],
  ])("renvoie 422 : %s", async (_cas, query) => {
    const response = await server().inject({ url: url(query) });
    expect(response.statusCode).toBe(422);
    expect(code(response)).toBe("INVALID_REQUEST");
  });

  it("renvoie 404 pour un site inconnu", async () => {
    const response = await server().inject({
      url: url(
        "from=2026-11-26T10:00:00Z&to=2026-11-26T11:00:00Z&interval=1m",
        "00000000-0000-4000-8000-000000000099",
      ),
    });
    expect(code(response)).toBe("NOT_FOUND");
  });
});

/**
 * Moyennes réelles par time_bucket() : nécessite une base TimescaleDB, désignée par
 * TEST_DATABASE_URL (par exemple celle de Docker Compose). Ignoré sinon, notamment en CI.
 * Tout est fait dans une transaction annulée : la base n'est pas modifiée.
 */
describe.skipIf(!process.env.TEST_DATABASE_URL)("agrégation par time_bucket (base réelle)", () => {
  it("moyenne par intervalle et trie par date croissante", async () => {
    const { db, pool } = createDb(process.env.TEST_DATABASE_URL!);
    const rollback = new Error("annulation du test");
    let series: Awaited<ReturnType<HistoryRepository["sitePoints"]>> = [];
    try {
      await db.transaction(async (tx) => {
        const [site] = await tx
          .insert(sites)
          .values({
            code: "TEST99",
            name: "Site de test",
            latitude: 0,
            longitude: 0,
            peakPowerW: 1000,
            batteryCapacityWh: 1000,
            maxChargePowerW: 500,
            productionFactor: 1,
          })
          .returning({ id: sites.id });
        const base = { siteId: site!.id, temperatureC: 20, batteryLevelPct: 50, batteryPowerW: 0 };
        const rows = [
          // Insérées dans le désordre : 10:05 (moyenne 300), puis 10:00 (moyenne 150).
          { time: "2026-11-26T10:06:00Z", productionW: 400 },
          { time: "2026-11-26T10:00:00Z", productionW: 100 },
          { time: "2026-11-26T10:05:00Z", productionW: 200 },
          { time: "2026-11-26T10:03:00Z", productionW: 200 },
        ];
        await tx.insert(siteMeasurements).values(
          rows.map((r) => ({
            ...base,
            time: new Date(r.time),
            irradianceWM2: r.productionW,
            productionW: r.productionW,
            gridPowerW: r.productionW,
            mode: "automatic" as const,
          })),
        );
        const repository = createHistoryRepository({ db: tx, pool } as unknown as Database);
        series = await repository.sitePoints(site!.id, {
          from: "2026-11-26T10:00:00Z",
          to: "2026-11-26T10:10:00Z",
          interval: "5m",
        });
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await pool.end();
    }
    expect(series.map((p) => [new Date(p.time).toISOString(), p.production])).toEqual([
      ["2026-11-26T10:00:00.000Z", 150],
      ["2026-11-26T10:05:00.000Z", 300],
    ]);
  });
});
