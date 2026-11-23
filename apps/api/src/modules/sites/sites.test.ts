import {
  DEMO_SITE_PRODUCTION_FACTOR,
  ErrorResponseSchema,
  MESSAGE_VERSION,
  SiteDetailSchema,
  SiteListSchema,
  type ControlState,
} from "@solar/contracts";
import { describe, expect, it } from "vitest";
import { buildServer } from "../../server";
import { createControlStateStore } from "./control-states";
import type { MeasurementRow, SetpointRow, SiteRow, SitesRepository } from "./repository";
import { createSitesService, expectedProduction } from "./service";

const SITE: SiteRow = {
  id: "00000000-0000-4000-8000-000000000001",
  code: "SITE01",
  name: "Parc solaire de démonstration",
  latitude: 47.25,
  longitude: -1.55,
  peakPowerW: 4000,
  batteryCapacityWh: 10000,
  maxChargePowerW: 3000,
  productionFactor: DEMO_SITE_PRODUCTION_FACTOR,
  createdAt: new Date("2026-11-01T00:00:00Z"),
};

const MEASUREMENT: MeasurementRow = {
  time: new Date("2026-11-23T10:00:00Z"),
  siteId: SITE.id,
  irradianceWM2: 800,
  productionW: 3100,
  temperatureC: 31.5,
  batteryLevelPct: 62,
  batteryPowerW: 900,
  gridPowerW: 2200,
  mode: "manual",
  simulatedFault: false,
};

const SETPOINT: SetpointRow = {
  id: "00000000-0000-4000-8000-000000000010",
  siteId: SITE.id,
  authorId: "00000000-0000-4000-8000-000000000020",
  authorName: "Exploitant de démo",
  mode: "manual",
  requestedBatteryShare: 70,
  status: "applied",
  appliedBatteryShare: 70,
  rejectionReason: null,
  createdAt: new Date("2026-11-23T09:59:00Z"),
  respondedAt: new Date("2026-11-23T09:59:02Z"),
};

const STATE: ControlState = {
  v: MESSAGE_VERSION,
  setpointId: SETPOINT.id,
  mode: "manual",
  status: "applied",
  appliedBatteryShare: 70,
  reason: null,
  timestamp: "2026-11-23T09:59:02Z",
};

function repository(withData = true): SitesRepository {
  return {
    listSites: async () => [SITE],
    findSite: async (id) => (id === SITE.id ? SITE : null),
    findDevice: async () =>
      withData
        ? { status: "online", lastSeenAt: new Date("2026-11-23T10:00:01Z") }
        : { status: "unknown", lastSeenAt: null },
    findLatestMeasurement: async () => (withData ? MEASUREMENT : null),
    countActiveAlerts: async () => (withData ? 2 : 0),
    findLatestSetpoint: async () => (withData ? SETPOINT : null),
  };
}

function server(withData = true) {
  const controlStates = createControlStateStore();
  if (withData) controlStates.set("SITE01", STATE);
  return buildServer({
    config: { LOG_LEVEL: "silent", NODE_ENV: "test" },
    checkDatabase: async () => true,
    sites: createSitesService(repository(withData), controlStates),
  });
}

describe("GET /v1/sites", () => {
  it("renvoie la liste des sites au format SiteSummary", async () => {
    const response = await server().inject({ url: "/v1/sites" });
    expect(response.statusCode).toBe(200);
    const [site] = SiteListSchema.parse(response.json());
    expect(site).toMatchObject({
      code: "SITE01",
      deviceStatus: "online",
      activeAlertCount: 2,
      latestMeasurement: { production: 3100, timestamp: "2026-11-23T10:00:00.000Z" },
    });
  });

  it("renvoie latestMeasurement à null pour un site sans mesure", async () => {
    const response = await server(false).inject({ url: "/v1/sites" });
    const [site] = SiteListSchema.parse(response.json());
    expect(site?.latestMeasurement).toBeNull();
    expect(site?.deviceStatus).toBe("unknown");
  });
});

describe("GET /v1/sites/{id}", () => {
  it("renvoie le détail au format SiteDetail", async () => {
    const response = await server().inject({ url: `/v1/sites/${SITE.id}` });
    expect(response.statusCode).toBe(200);
    const site = SiteDetailSchema.parse(response.json());
    expect(site.peakPowerW).toBe(4000);
    expect(site.currentSetpoint).toMatchObject({
      id: SETPOINT.id,
      author: { name: "Exploitant de démo" },
      status: "applied",
    });
    expect(site.controlState).toEqual(STATE);
    expect(site.deviceLastSeenAt).toBe("2026-11-23T10:00:01.000Z");
  });

  it("calcule la production attendue : ensoleillement × facteur de production", async () => {
    const response = await server().inject({ url: `/v1/sites/${SITE.id}` });
    const site = SiteDetailSchema.parse(response.json());
    expect(site.latestMeasurement?.expectedProduction).toBe(800 * DEMO_SITE_PRODUCTION_FACTOR);
    expect(expectedProduction(250, 4)).toBe(1000);
  });

  it("renvoie 404 NOT_FOUND pour un identifiant inconnu", async () => {
    const response = await server().inject({
      url: "/v1/sites/00000000-0000-4000-8000-000000000099",
    });
    expect(response.statusCode).toBe(404);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe("NOT_FOUND");
  });

  it("renvoie 422 pour un identifiant mal formé", async () => {
    const response = await server().inject({ url: "/v1/sites/pas-un-uuid" });
    expect(response.statusCode).toBe(422);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe("INVALID_REQUEST");
  });
});
