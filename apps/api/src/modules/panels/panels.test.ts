import {
  ErrorResponseSchema,
  LoginResponseSchema,
  PANEL_NO_DATA_TIMEOUT_S,
  PanelDetailSchema,
  PanelListSchema,
} from "@solar/contracts";
import argon2 from "argon2";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../server";
import type { AuthRepository, UserRow } from "../auth/repository";
import { createAuthService } from "../auth/service";
import type { AlertRow, LatestPanelMeasurement, PanelRow, PanelsRepository } from "./repository";
import { createPanelsService, expectedPanelProduction, panelStatus } from "./service";

const NOW = new Date("2026-11-26T10:00:00Z");
const SITE = { id: "00000000-0000-4000-8000-000000000001", name: "Parc de démo" };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function panel(n: number, placed = true): PanelRow {
  return {
    id: id(100 + n),
    siteId: SITE.id,
    code: `P${String(n).padStart(2, "0")}`,
    name: `Panneau ${n}`,
    latitude: placed ? 47.25 + n / 10000 : null,
    longitude: placed ? -1.55 : null,
    ratedPowerW: 200,
    source: placed ? "seed" : "discovered",
  };
}

const ago = (s: number) => new Date(NOW.getTime() - s * 1000);

describe("statut d'un panneau (section 6 de l'UML)", () => {
  const fresh: LatestPanelMeasurement = { time: ago(5), productionW: 150, temperatureC: 30 };
  const stale: LatestPanelMeasurement = {
    time: ago(PANEL_NO_DATA_TIMEOUT_S + 1),
    productionW: 150,
    temperatureC: 30,
  };
  it("normal : mesure récente et aucune alerte", () => {
    expect(panelStatus(fresh, 0, NOW)).toBe("normal");
  });
  it("alert : au moins une alerte active, même sans mesure récente", () => {
    expect(panelStatus(fresh, 1, NOW)).toBe("alert");
    expect(panelStatus(stale, 2, NOW)).toBe("alert");
  });
  it("no_data : aucune mesure depuis 60 s, ou jamais", () => {
    expect(panelStatus(stale, 0, NOW)).toBe("no_data");
    expect(panelStatus(undefined, 0, NOW)).toBe("no_data");
  });
  it("production attendue = ensoleillement × puissance nominale / 1000", () => {
    expect(expectedPanelProduction(800, 200)).toBe(160);
  });
});

// Données : P01 normal, P02 en alerte, P03 sans donnée, P21 détecté non positionné.
const PANELS = [panel(1), panel(2), panel(3), panel(21, false)];
const ALERT: AlertRow = {
  id: id(500),
  siteId: SITE.id,
  panelId: id(102),
  type: "low_production",
  severity: "warning",
  message: "Production basse sur Panneau 2 : 30 W au lieu de 160 W attendus",
  status: "active",
  startedAt: ago(120),
  endedAt: null,
};

function repository(): PanelsRepository & { panels: PanelRow[] } {
  const panels = [...PANELS];
  return {
    panels,
    findSite: async (siteId) => (siteId === SITE.id ? SITE : null),
    listPanels: async () => panels,
    findPanel: async (panelId) => panels.find((p) => p.id === panelId) ?? null,
    latestMeasurements: async (ids) =>
      new Map(
        ids
          .filter((pid) => pid !== id(103))
          .map((pid) => [pid, { time: ago(5), productionW: 150, temperatureC: 30 }]),
      ),
    latestIrradiance: async () => 800,
    activePanelAlerts: async (ids) => (ids.includes(id(102)) ? [ALERT] : []),
    updatePanel: async (panelId, changes) => {
      const p = panels.find((x) => x.id === panelId);
      if (!p) return null;
      Object.assign(p, changes);
      return p;
    },
    deletePanel: async (panelId) => {
      const index = panels.findIndex((p) => p.id === panelId);
      if (index < 0) return false;
      panels.splice(index, 1);
      return true;
    },
  };
}

let USERS: UserRow[];
beforeAll(async () => {
  const passwordHash = await argon2.hash("secret", { type: argon2.argon2id });
  const createdAt = NOW;
  USERS = [
    {
      id: id(1),
      email: "operator@demo.local",
      name: "E",
      role: "operator",
      passwordHash,
      createdAt,
    },
    { id: id(2), email: "viewer@demo.local", name: "L", role: "viewer", passwordHash, createdAt },
  ];
});

async function setup() {
  const repo = repository();
  const auth: AuthRepository = {
    findUserByEmail: async (email) => USERS.find((u) => u.email === email) ?? null,
    findUserById: async (userId) => USERS.find((u) => u.id === userId) ?? null,
  };
  const app = buildServer({
    config: { LOG_LEVEL: "silent", NODE_ENV: "test" },
    checkDatabase: async () => true,
    auth: { service: createAuthService(auth), jwtSecret: "x".repeat(32) },
    panels: createPanelsService(repo, () => NOW),
  });
  const token = async (role: "operator" | "viewer") => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: `${role}@demo.local`, password: "secret" },
    });
    return { authorization: `Bearer ${LoginResponseSchema.parse(response.json()).token}` };
  };
  return { app, repo, operator: await token("operator"), viewer: await token("viewer") };
}

const code = (response: { json: () => unknown }) =>
  ErrorResponseSchema.parse(response.json()).error.code;

describe("GET /v1/sites/{id}/panels et /v1/panels/{id}", () => {
  it("liste tous les panneaux, positionnés ou non, avec leur statut", async () => {
    const { app, viewer } = await setup();
    const response = await app.inject({ url: `/v1/sites/${SITE.id}/panels`, headers: viewer });
    expect(response.statusCode).toBe(200);
    const list = PanelListSchema.parse(response.json());
    expect(list.map((p) => [p.code, p.status, p.placed])).toEqual([
      ["P01", "normal", true],
      ["P02", "alert", true],
      ["P03", "no_data", true],
      ["P21", "normal", false],
    ]);
    expect(list[3]).toMatchObject({ latitude: null, longitude: null, source: "discovered" });
  });

  it("détaille un panneau : production attendue et alertes actives", async () => {
    const { app, viewer } = await setup();
    const response = await app.inject({ url: `/v1/panels/${id(102)}`, headers: viewer });
    const detail = PanelDetailSchema.parse(response.json());
    expect(detail.expectedProduction).toBe(160);
    expect(detail.activeAlerts).toHaveLength(1);
    expect(detail.activeAlerts[0]?.panel).toEqual({ id: id(102), name: "Panneau 2" });
  });

  it("renvoie 404 pour un site ou un panneau inconnu, 401 sans jeton", async () => {
    const { app, viewer } = await setup();
    expect(code(await app.inject({ url: `/v1/sites/${id(999)}/panels`, headers: viewer }))).toBe(
      "NOT_FOUND",
    );
    expect(code(await app.inject({ url: `/v1/panels/${id(999)}`, headers: viewer }))).toBe(
      "NOT_FOUND",
    );
    expect((await app.inject({ url: `/v1/panels/${id(101)}` })).statusCode).toBe(401);
  });
});

describe("PATCH et DELETE /v1/panels/{id}", () => {
  it("positionne un panneau détecté (exploitant)", async () => {
    const { app, operator } = await setup();
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/panels/${id(121)}`,
      headers: operator,
      payload: { latitude: 47.2501, longitude: -1.5502, name: "Rangée E, panneau 21" },
    });
    expect(response.statusCode).toBe(200);
    expect(PanelDetailSchema.parse(response.json())).toMatchObject({
      placed: true,
      name: "Rangée E, panneau 21",
    });
  });

  it("refuse la modification à un lecteur (403)", async () => {
    const { app, viewer } = await setup();
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/panels/${id(101)}`,
      headers: viewer,
      payload: { name: "X" },
    });
    expect(response.statusCode).toBe(403);
    expect(code(response)).toBe("FORBIDDEN");
  });

  it.each([
    ["latitude sans longitude", { latitude: 47.25 }],
    ["latitude hors bornes", { latitude: 95, longitude: 0 }],
    ["corps vide", {}],
  ])("renvoie 422 : %s", async (_cas, payload) => {
    const { app, operator } = await setup();
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/panels/${id(101)}`,
      headers: operator,
      payload,
    });
    expect(response.statusCode).toBe(422);
    expect(code(response)).toBe("INVALID_REQUEST");
  });

  it("supprime un panneau (204), puis 404 ; refusé à un lecteur", async () => {
    const { app, repo, operator, viewer } = await setup();
    const url = `/v1/panels/${id(103)}`;
    expect((await app.inject({ method: "DELETE", url, headers: viewer })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url, headers: operator })).statusCode).toBe(204);
    expect(repo.panels.some((p) => p.id === id(103))).toBe(false);
    expect((await app.inject({ method: "DELETE", url, headers: operator })).statusCode).toBe(404);
  });
});
