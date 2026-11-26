import {
  AlertPageSchema,
  ErrorResponseSchema,
  LOW_PRODUCTION_DURATION_S,
  LoginResponseSchema,
  MESSAGE_VERSION,
  type AlertType,
  type PanelMeasurement,
  type SiteMeasurement,
} from "@solar/contracts";
import argon2 from "argon2";
import type { FastifyBaseLogger } from "fastify";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildServer } from "../../server";
import type { AuthRepository, UserRow } from "../auth/repository";
import { createAuthService } from "../auth/service";
import { createAlertEngine } from "./engine";
import type {
  AlertFilter,
  AlertRow,
  AlertsRepository,
  AlertWithNames,
  NewAlert,
  PanelInfo,
  SiteInfo,
} from "./repository";
import { createAlertsService } from "./service";

const START = new Date("2026-11-26T10:00:00Z");
const at = (seconds: number) => new Date(START.getTime() + seconds * 1000);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const SITE: SiteInfo = { id: id(1), code: "SITE01", name: "Parc de démo", productionFactor: 4 };
const PANEL: PanelInfo = { id: id(107), name: "Panneau 7", ratedPowerW: 200 };

/** Dépôt en mémoire qui reproduit l'index unique « une alerte active par site, panneau, type ». */
function fakeRepository(irradianceInDb: number | null = null) {
  const rows: AlertWithNames[] = [];
  let counter = 500;
  const repository: AlertsRepository = {
    findSiteByCode: async (code) => (code === SITE.code ? SITE : null),
    findSiteById: async (siteId) => (siteId === SITE.id ? SITE : null),
    findPanel: async (siteId, code) => (siteId === SITE.id && code === "P07" ? PANEL : null),
    latestIrradiance: async () => irradianceInDb,
    insert: async (alert: NewAlert) => {
      const duplicate = rows.some(
        (r) =>
          r.status === "active" &&
          r.siteId === alert.siteId &&
          (r.panelId ?? null) === (alert.panelId ?? null) &&
          r.type === alert.type,
      );
      if (duplicate) return null;
      const row: AlertWithNames = {
        id: id(counter++),
        siteId: alert.siteId,
        panelId: alert.panelId ?? null,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        status: "active",
        startedAt: at(counter - 500),
        endedAt: null,
        siteName: SITE.name,
        panelName: alert.panelId ? PANEL.name : null,
      };
      rows.push(row);
      return row;
    },
    resolve: async (siteId, panelId, types, endedAt) => {
      const targets = rows.filter(
        (r) =>
          r.status === "active" &&
          r.siteId === siteId &&
          (r.panelId ?? null) === panelId &&
          types.includes(r.type),
      );
      for (const r of targets) Object.assign(r, { status: "resolved", endedAt });
      return targets.length;
    },
    list: async (filter: AlertFilter, limit) =>
      rows
        .filter(
          (r) =>
            (!filter.status || r.status === filter.status) &&
            (!filter.siteId || r.siteId === filter.siteId) &&
            (!filter.before || r.startedAt < filter.before),
        )
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, limit),
  };
  return { repository, rows };
}

function setup(irradianceInDb: number | null = null) {
  const fake = fakeRepository(irradianceInDb);
  const notified: AlertRow[] = [];
  const notify = vi.fn(async (alert: AlertRow) => {
    notified.push(alert);
  });
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as FastifyBaseLogger;
  const engine = createAlertEngine(fake.repository, notify, logger);
  const active = (type: AlertType) =>
    fake.rows.filter((r) => r.type === type && r.status === "active");
  const all = (type: AlertType) => fake.rows.filter((r) => r.type === type);
  return { ...fake, engine, notify, notified, logger, active, all };
}

function site(overrides: Partial<SiteMeasurement> = {}, seconds = 0): SiteMeasurement {
  return {
    v: MESSAGE_VERSION,
    timestamp: at(seconds).toISOString(),
    irradiance: 500,
    production: 2000,
    temperature: 30,
    batteryLevel: 60,
    batteryPower: 0,
    gridPower: 0,
    mode: "automatic",
    simulatedFault: false,
    ...overrides,
  };
}

function panel(overrides: Partial<PanelMeasurement> = {}, seconds = 0): PanelMeasurement {
  return {
    v: MESSAGE_VERSION,
    timestamp: at(seconds).toISOString(),
    production: 100,
    temperature: 30,
    ...overrides,
  };
}

describe("règle low_production du site", () => {
  // Ensoleillement 500 W/m², facteur 4 : production attendue 2 000 W, seuil bas 1 400 W.
  it("ne s'ouvre qu'après 60 s de production basse en continu", async () => {
    const t = setup();
    for (let s = 0; s < LOW_PRODUCTION_DURATION_S; s += 5) {
      await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1000 }), at(s));
      expect(t.all("low_production")).toHaveLength(0);
    }
    await t.engine.evaluateSiteMeasurement(
      "SITE01",
      site({ production: 1000 }),
      at(LOW_PRODUCTION_DURATION_S),
    );
    expect(t.active("low_production")).toMatchObject([
      {
        severity: "warning",
        panelId: null,
        message: "Production basse sur Parc de démo : 1000 W au lieu de 2000 W attendus",
      },
    ]);
    expect(t.notified).toHaveLength(1);
  });

  it("ne se répète pas tant qu'elle est active", async () => {
    const t = setup();
    for (let s = 0; s <= 120; s += 5) {
      await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1000 }), at(s));
    }
    expect(t.all("low_production")).toHaveLength(1);
    expect(t.notify).toHaveBeenCalledTimes(1);
  });

  it("une remontée dans la zone d'hystérésis interrompt le décompte, mais pas l'alerte ouverte", async () => {
    const t = setup();
    // Décompte interrompu à 30 s par une production à 75 % (entre 70 % et 80 %).
    await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1000 }), at(0));
    await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1500 }), at(30));
    await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1000 }), at(40));
    await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1000 }), at(70));
    expect(t.all("low_production")).toHaveLength(0);
    await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1000 }), at(100));
    expect(t.active("low_production")).toHaveLength(1);
    // 75 % : l'alerte reste active (résolution à 80 % seulement).
    await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1500 }), at(105));
    expect(t.active("low_production")).toHaveLength(1);
  });

  it("se résout quand la production atteint 80 % de l'attendue", async () => {
    const t = setup();
    for (let s = 0; s <= 60; s += 5) {
      await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1000 }), at(s));
    }
    await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1600 }), at(65));
    expect(t.active("low_production")).toHaveLength(0);
    expect(t.all("low_production")[0]).toMatchObject({ status: "resolved", endedAt: at(65) });
  });

  it("se résout quand l'ensoleillement tombe à 100 W/m² ou moins", async () => {
    const t = setup();
    for (let s = 0; s <= 60; s += 5) {
      await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1000 }), at(s));
    }
    await t.engine.evaluateSiteMeasurement(
      "SITE01",
      site({ irradiance: 100, production: 0 }),
      at(65),
    );
    expect(t.active("low_production")).toHaveLength(0);
  });

  it("n'est pas évaluée sous 100 W/m² d'ensoleillement", async () => {
    const t = setup();
    for (let s = 0; s <= 120; s += 5) {
      await t.engine.evaluateSiteMeasurement(
        "SITE01",
        site({ irradiance: 100, production: 0 }),
        at(s),
      );
    }
    expect(t.all("low_production")).toHaveLength(0);
  });

  it("une alerte résolue n'est pas rouverte : la condition crée une nouvelle alerte", async () => {
    const t = setup();
    for (let s = 0; s <= 60; s += 5) {
      await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1000 }), at(s));
    }
    await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 2000 }), at(65));
    for (let s = 70; s <= 130; s += 5) {
      await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1000 }), at(s));
    }
    expect(t.all("low_production").map((a) => a.status)).toEqual(["resolved", "active"]);
  });

  it("un trou de plus de 60 s dans les mesures interrompt la continuité", async () => {
    const t = setup();
    await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1000 }), at(0));
    // Plus aucune mesure pendant 5 minutes, puis une mesure basse : le décompte repart de zéro.
    await t.engine.evaluateSiteMeasurement("SITE01", site({ production: 1000 }), at(300));
    expect(t.all("low_production")).toHaveLength(0);
  });
});

describe("règle low_production d'un panneau", () => {
  // Ensoleillement 800 W/m², 200 W crête : 160 W attendus, seuil bas 112 W, résolution 128 W.
  it("s'ouvre sur le panneau après 60 s, avec le nom du panneau", async () => {
    const t = setup();
    await t.engine.evaluateSiteMeasurement("SITE01", site({ irradiance: 800 }), at(0));
    for (let s = 0; s <= 60; s += 10) {
      await t.engine.evaluatePanelMeasurement("SITE01", "P07", panel({ production: 30 }), at(s));
    }
    expect(t.active("low_production")).toMatchObject([
      {
        panelId: PANEL.id,
        severity: "warning",
        message: "Production basse sur Panneau 7 : 30 W au lieu de 160 W attendus",
      },
    ]);
    expect(t.notified).toHaveLength(1);
  });

  it("utilise l'ensoleillement de la base quand aucune mesure du site n'a été reçue", async () => {
    const t = setup(800);
    for (let s = 0; s <= 60; s += 10) {
      await t.engine.evaluatePanelMeasurement("SITE01", "P07", panel({ production: 30 }), at(s));
    }
    expect(t.active("low_production")).toHaveLength(1);
  });

  it("se résout à 80 % de la production attendue", async () => {
    const t = setup();
    await t.engine.evaluateSiteMeasurement("SITE01", site({ irradiance: 800 }), at(0));
    for (let s = 0; s <= 60; s += 10) {
      await t.engine.evaluatePanelMeasurement("SITE01", "P07", panel({ production: 30 }), at(s));
    }
    await t.engine.evaluatePanelMeasurement("SITE01", "P07", panel({ production: 120 }), at(70));
    expect(t.active("low_production")).toHaveLength(1);
    await t.engine.evaluatePanelMeasurement("SITE01", "P07", panel({ production: 128 }), at(80));
    expect(t.active("low_production")).toHaveLength(0);
  });

  it("ignore un panneau ou un site inconnu", async () => {
    const t = setup(800);
    await t.engine.evaluatePanelMeasurement("SITE01", "P99", panel({ temperature: 90 }), at(0));
    await t.engine.evaluatePanelMeasurement("AUTRE", "P07", panel({ temperature: 90 }), at(0));
    expect(t.rows).toHaveLength(0);
  });
});

describe("règle overheating", () => {
  it("site : s'ouvre au-dessus de 75 °C, reste entre 70 et 75 °C, se résout sous 70 °C", async () => {
    const t = setup();
    await t.engine.evaluateSiteMeasurement("SITE01", site({ temperature: 75 }), at(0));
    expect(t.all("overheating")).toHaveLength(0);
    await t.engine.evaluateSiteMeasurement("SITE01", site({ temperature: 76 }), at(5));
    expect(t.active("overheating")).toMatchObject([
      { severity: "critical", message: "Surchauffe sur Parc de démo : 76 °C" },
    ]);
    await t.engine.evaluateSiteMeasurement("SITE01", site({ temperature: 77 }), at(10));
    await t.engine.evaluateSiteMeasurement("SITE01", site({ temperature: 72 }), at(15));
    expect(t.all("overheating")).toHaveLength(1);
    expect(t.active("overheating")).toHaveLength(1);
    await t.engine.evaluateSiteMeasurement("SITE01", site({ temperature: 69 }), at(20));
    expect(t.active("overheating")).toHaveLength(0);
    expect(t.notify).toHaveBeenCalledTimes(1);
  });

  it("panneau : alerte rattachée au panneau, critique, avec notification", async () => {
    const t = setup(800);
    await t.engine.evaluatePanelMeasurement("SITE01", "P07", panel({ temperature: 80 }), at(0));
    expect(t.active("overheating")).toMatchObject([
      { panelId: PANEL.id, severity: "critical", message: "Surchauffe sur Panneau 7 : 80 °C" },
    ]);
    expect(t.notified).toHaveLength(1);
    await t.engine.evaluatePanelMeasurement("SITE01", "P07", panel({ temperature: 80 }), at(10));
    expect(t.all("overheating")).toHaveLength(1);
    await t.engine.evaluatePanelMeasurement("SITE01", "P07", panel({ temperature: 65 }), at(20));
    expect(t.active("overheating")).toHaveLength(0);
  });

  it("une surchauffe du site et celle d'un panneau sont deux alertes distinctes", async () => {
    const t = setup(800);
    await t.engine.evaluateSiteMeasurement("SITE01", site({ temperature: 80 }), at(0));
    await t.engine.evaluatePanelMeasurement("SITE01", "P07", panel({ temperature: 80 }), at(0));
    expect(t.active("overheating")).toHaveLength(2);
  });
});

describe("règle battery_low", () => {
  it("s'ouvre à 20 % ou moins, reste jusqu'à 25 %, se résout à 25 %", async () => {
    const t = setup();
    await t.engine.evaluateSiteMeasurement("SITE01", site({ batteryLevel: 21 }), at(0));
    expect(t.all("battery_low")).toHaveLength(0);
    await t.engine.evaluateSiteMeasurement("SITE01", site({ batteryLevel: 20 }), at(5));
    expect(t.active("battery_low")).toMatchObject([
      { severity: "warning", message: "Batterie faible sur Parc de démo : 20 %" },
    ]);
    await t.engine.evaluateSiteMeasurement("SITE01", site({ batteryLevel: 19 }), at(10));
    await t.engine.evaluateSiteMeasurement("SITE01", site({ batteryLevel: 24 }), at(15));
    expect(t.active("battery_low")).toHaveLength(1);
    await t.engine.evaluateSiteMeasurement("SITE01", site({ batteryLevel: 25 }), at(20));
    expect(t.active("battery_low")).toHaveLength(0);
    expect(t.all("battery_low")).toHaveLength(1);
    expect(t.notified.map((a) => a.type)).toEqual(["battery_low"]);
  });
});

describe("règle battery_full", () => {
  it("s'ouvre à 95 %, reste jusqu'à 90 %, se résout à 90 % ; gravité info : pas de notification", async () => {
    const t = setup();
    await t.engine.evaluateSiteMeasurement("SITE01", site({ batteryLevel: 94 }), at(0));
    expect(t.all("battery_full")).toHaveLength(0);
    await t.engine.evaluateSiteMeasurement("SITE01", site({ batteryLevel: 95 }), at(5));
    expect(t.active("battery_full")).toMatchObject([
      {
        severity: "info",
        message: "Batterie pleine sur Parc de démo : la charge est suspendue",
      },
    ]);
    await t.engine.evaluateSiteMeasurement("SITE01", site({ batteryLevel: 96 }), at(10));
    await t.engine.evaluateSiteMeasurement("SITE01", site({ batteryLevel: 91 }), at(15));
    expect(t.active("battery_full")).toHaveLength(1);
    await t.engine.evaluateSiteMeasurement("SITE01", site({ batteryLevel: 90 }), at(20));
    expect(t.active("battery_full")).toHaveLength(0);
    expect(t.all("battery_full")).toHaveLength(1);
    expect(t.notify).not.toHaveBeenCalled();
  });
});

describe("règles setpoint_rejected et setpoint_no_response (point d'entrée commun)", () => {
  const rejected: NewAlert = {
    siteId: SITE.id,
    type: "setpoint_rejected",
    severity: "warning",
    message: "Consigne refusée sur Parc de démo : la batterie est pleine",
  };
  const noResponse: NewAlert = {
    siteId: SITE.id,
    type: "setpoint_no_response",
    severity: "critical",
    message: "L'objet du site Parc de démo ne répond pas à la consigne",
  };

  it("ouvre une seule fois, notifie à l'ouverture, puis résout", async () => {
    const t = setup();
    expect(await t.engine.open(rejected)).toBe(true);
    expect(await t.engine.open(rejected)).toBe(false);
    expect(await t.engine.open(noResponse)).toBe(true);
    expect(t.notified.map((a) => a.type)).toEqual(["setpoint_rejected", "setpoint_no_response"]);
    await t.engine.resolve(
      { siteId: SITE.id },
      ["setpoint_rejected", "setpoint_no_response"],
      at(9),
    );
    expect(t.rows.map((r) => r.status)).toEqual(["resolved", "resolved"]);
    // Résolue puis de nouveau déclenchée : nouvelle alerte.
    expect(await t.engine.open(rejected)).toBe(true);
    expect(t.all("setpoint_rejected")).toHaveLength(2);
  });
});

describe("règle device_offline", () => {
  it("s'ouvre en critique avec notification, sans doublon, et se résout au retour de l'objet", async () => {
    const t = setup();
    await t.engine.deviceOffline(SITE.id);
    await t.engine.deviceOffline(SITE.id);
    expect(t.active("device_offline")).toMatchObject([
      { severity: "critical", message: "L'objet du site Parc de démo est hors ligne" },
    ]);
    expect(t.notify).toHaveBeenCalledTimes(1);
    await t.engine.deviceOnline(SITE.id, at(30));
    expect(t.active("device_offline")).toHaveLength(0);
    expect(t.all("device_offline")[0]).toMatchObject({ status: "resolved", endedAt: at(30) });
  });

  it("un site inconnu n'ouvre rien", async () => {
    const t = setup();
    await t.engine.deviceOffline(id(99));
    expect(t.rows).toHaveLength(0);
  });
});

describe("notification à l'ouverture", () => {
  it("une erreur d'envoi ne casse pas le traitement et l'alerte reste ouverte", async () => {
    const t = setup();
    t.notify.mockRejectedValueOnce(new Error("Expo injoignable"));
    await expect(t.engine.deviceOffline(SITE.id)).resolves.toBeUndefined();
    expect(t.active("device_offline")).toHaveLength(1);
    expect(t.logger.error).toHaveBeenCalled();
  });

  it("le journal ne contient aucune donnée personnelle", async () => {
    const t = setup();
    await t.engine.deviceOffline(SITE.id);
    const logged = JSON.stringify(vi.mocked(t.logger.info).mock.calls);
    expect(logged).not.toMatch(/@|operator|viewer/i);
  });
});

// --- GET /v1/alerts -----------------------------------------------------------------------

let USERS: UserRow[];
beforeAll(async () => {
  const passwordHash = await argon2.hash("secret", { type: argon2.argon2id });
  USERS = [
    {
      id: id(10),
      email: "viewer@demo.local",
      name: "Lecteur",
      role: "viewer",
      passwordHash,
      createdAt: START,
    },
  ];
});

async function serverSetup() {
  const t = setup(800);
  // Trois alertes : une résolue (la plus ancienne) puis deux actives.
  await t.engine.deviceOffline(SITE.id);
  await t.engine.deviceOnline(SITE.id, at(10));
  await t.engine.evaluateSiteMeasurement("SITE01", site({ temperature: 80 }), at(20));
  await t.engine.evaluatePanelMeasurement("SITE01", "P07", panel({ temperature: 80 }), at(30));

  const auth: AuthRepository = {
    findUserByEmail: async (email) => USERS.find((u) => u.email === email) ?? null,
    findUserById: async (userId) => USERS.find((u) => u.id === userId) ?? null,
  };
  const app = buildServer({
    config: { LOG_LEVEL: "silent", NODE_ENV: "test" },
    checkDatabase: async () => true,
    auth: { service: createAuthService(auth), jwtSecret: "x".repeat(32) },
    alerts: createAlertsService(t.repository),
  });
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { email: "viewer@demo.local", password: "secret" },
  });
  const headers = { authorization: `Bearer ${LoginResponseSchema.parse(response.json()).token}` };
  return { app, headers };
}

describe("GET /v1/alerts", () => {
  it("401 sans jeton", async () => {
    const { app } = await serverSetup();
    const response = await app.inject({ method: "GET", url: "/v1/alerts" });
    expect(response.statusCode).toBe(401);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("422 sur un statut invalide, une limite invalide ou un siteId qui n'est pas un UUID", async () => {
    const { app, headers } = await serverSetup();
    for (const query of ["status=closed", "limit=0", "limit=101", "siteId=abc", "before=hier"]) {
      const response = await app.inject({ method: "GET", url: `/v1/alerts?${query}`, headers });
      expect(response.statusCode, query).toBe(422);
      expect(ErrorResponseSchema.parse(response.json()).error.code).toBe("INVALID_REQUEST");
    }
  });

  it("liste toutes les alertes, de la plus récente à la plus ancienne, conformes à Alert", async () => {
    const { app, headers } = await serverSetup();
    const response = await app.inject({ method: "GET", url: "/v1/alerts", headers });
    expect(response.statusCode).toBe(200);
    const page = AlertPageSchema.parse(response.json());
    expect(page.items.map((a) => a.type)).toEqual(["overheating", "overheating", "device_offline"]);
    expect(page.items[0]?.panel).toEqual({ id: PANEL.id, name: PANEL.name });
    expect(page.items[1]?.panel).toBeNull();
    expect(page.items[0]?.site).toEqual({ id: SITE.id, name: SITE.name });
    expect(page.next).toBeNull();
  });

  it("filtre par statut et par site", async () => {
    const { app, headers } = await serverSetup();
    const get = async (query: string) =>
      AlertPageSchema.parse(
        (await app.inject({ method: "GET", url: `/v1/alerts?${query}`, headers })).json(),
      );
    expect((await get("status=active")).items).toHaveLength(2);
    const resolved = (await get("status=resolved")).items;
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ type: "device_offline", status: "resolved" });
    expect(resolved[0]?.endedAt).toBe(at(10).toISOString());
    expect((await get(`siteId=${SITE.id}`)).items).toHaveLength(3);
    expect((await get(`siteId=${id(99)}`)).items).toHaveLength(0);
  });

  it("pagine par curseur : next est la date de début de la dernière alerte de la page", async () => {
    const { app, headers } = await serverSetup();
    const get = async (query: string) =>
      AlertPageSchema.parse(
        (await app.inject({ method: "GET", url: `/v1/alerts?${query}`, headers })).json(),
      );
    const first = await get("limit=2");
    expect(first.items).toHaveLength(2);
    expect(first.next).toBe(first.items[1]?.startedAt);
    const second = await get(`limit=2&before=${encodeURIComponent(first.next ?? "")}`);
    expect(second.items.map((a) => a.type)).toEqual(["device_offline"]);
    expect(second.next).toBeNull();
  });
});
