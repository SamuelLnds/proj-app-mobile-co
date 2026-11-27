import {
  ErrorResponseSchema,
  LoginResponseSchema,
  MESSAGE_VERSION,
  SETPOINT_RESPONSE_TIMEOUT_S,
  SetpointPageSchema,
  SetpointRecordSchema,
  SetpointSchema,
  type AlertType,
  type ControlState,
  type DeviceStatusValue,
} from "@solar/contracts";
import argon2 from "argon2";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../server";
import type { AuthRepository, UserRow } from "../auth/repository";
import { createAuthService } from "../auth/service";
import type { AlertSink } from "../alerts/engine";
import type { NewAlert } from "../alerts/repository";
import type { SetpointRow, SetpointsRepository, SiteRef } from "./repository";
import { createSetpointsService } from "./service";

const START = new Date("2026-11-26T10:00:00Z");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SITE: SiteRef = { id: id(1), code: "SITE01", name: "Parc de démo" };
const OPERATOR = { id: id(10), name: "Exploitant" };
const at = (seconds: number) => new Date(START.getTime() + seconds * 1000);

interface FakeAlert extends NewAlert {
  status: "active" | "resolved";
}

/** Dépôt en mémoire qui reproduit les conditions SQL du dépôt réel. */
function fakeRepository(deviceStatus: DeviceStatusValue | null = "online") {
  const rows: SetpointRow[] = [];
  const alerts: FakeAlert[] = [];
  let counter = 1000;
  const state = { deviceStatus };

  const repository: SetpointsRepository = {
    findSite: async (siteId) => (siteId === SITE.id ? SITE : null),
    findSiteByCode: async (code) => (code === SITE.code ? SITE : null),
    findDeviceStatus: async () => state.deviceStatus,
    insert: async (setpoint) => {
      const row: SetpointRow = {
        id: id(counter++),
        ...setpoint,
        status: "sent",
        appliedBatteryShare: null,
        rejectionReason: null,
        createdAt: at(rows.length),
        respondedAt: null,
        authorName: OPERATOR.name,
      };
      rows.push(row);
      return row;
    },
    list: async (siteId, limit, before) =>
      rows
        .filter((r) => r.siteId === siteId && (!before || r.createdAt < before))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit),
    findLatest: async (siteId) => (await repository.list(siteId, 1))[0] ?? null,
    applyResponse: async (setpointId, response) => {
      const row = rows.find((r) => r.id === setpointId);
      if (!row || (row.status !== "sent" && row.status !== "no_response")) return null;
      Object.assign(row, response);
      return row;
    },
    markNoResponse: async (before) => {
      const expired = rows.filter((r) => r.status === "sent" && r.createdAt < before);
      for (const row of expired) row.status = "no_response";
      return expired.map((r) => ({ id: r.id, siteId: r.siteId }));
    },
  };

  /** Moteur d'alertes factice : même règle d'unicité que l'index de la base. */
  const sink: AlertSink = {
    open: async (alert) => {
      if (alerts.some((a) => a.type === alert.type && a.status === "active")) return false;
      alerts.push({ ...alert, status: "active" });
      return true;
    },
    resolve: async (_scope, types: AlertType[]) => {
      for (const a of alerts) if (types.includes(a.type)) a.status = "resolved";
    },
  };
  return { repository, sink, rows, alerts, state };
}

interface Published {
  topic: string;
  message: unknown;
  options: { qos: number; retain: boolean };
}

function stateMessage(setpointId: string | null, overrides: Partial<ControlState> = {}) {
  return {
    v: MESSAGE_VERSION,
    setpointId,
    mode: "manual",
    status: "applied",
    appliedBatteryShare: 70,
    reason: null,
    timestamp: at(5).toISOString(),
    ...overrides,
  } satisfies ControlState;
}

let USERS: UserRow[];
beforeAll(async () => {
  const passwordHash = await argon2.hash("secret", { type: argon2.argon2id });
  USERS = [
    {
      id: OPERATOR.id,
      email: "operator@demo.local",
      name: OPERATOR.name,
      role: "operator",
      passwordHash,
      createdAt: START,
    },
    {
      id: id(11),
      email: "viewer@demo.local",
      name: "Lecteur",
      role: "viewer",
      passwordHash,
      createdAt: START,
    },
  ];
});

async function setup(deviceStatus: DeviceStatusValue | null = "online") {
  const fake = fakeRepository(deviceStatus);
  const published: Published[] = [];
  const service = createSetpointsService(
    fake.repository,
    async (topic, message, options) => {
      published.push({ topic, message, options });
    },
    fake.sink,
  );
  const auth: AuthRepository = {
    findUserByEmail: async (email) => USERS.find((u) => u.email === email) ?? null,
    findUserById: async (userId) => USERS.find((u) => u.id === userId) ?? null,
  };
  const app = buildServer({
    config: { LOG_LEVEL: "silent", NODE_ENV: "test" },
    checkDatabase: async () => true,
    auth: { service: createAuthService(auth), jwtSecret: "x".repeat(32) },
    setpoints: service,
  });
  const token = async (role: "operator" | "viewer") => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: `${role}@demo.local`, password: "secret" },
    });
    return { authorization: `Bearer ${LoginResponseSchema.parse(response.json()).token}` };
  };
  return {
    ...fake,
    app,
    service,
    published,
    operator: await token("operator"),
    viewer: await token("viewer"),
  };
}

const code = (response: { json: () => unknown }) =>
  ErrorResponseSchema.parse(response.json()).error.code;
const post = (
  ctx: Awaited<ReturnType<typeof setup>>,
  payload: Record<string, unknown>,
  headers: Record<string, string> = ctx.operator,
  siteId = SITE.id,
) => ctx.app.inject({ method: "POST", url: `/v1/sites/${siteId}/setpoints`, headers, payload });

describe("POST /v1/sites/{id}/setpoints (#41)", () => {
  it("enregistre la consigne (sent), la publie en retained et répond 202", async () => {
    const ctx = await setup();
    const response = await post(ctx, { mode: "manual", batteryShare: 70 });
    expect(response.statusCode).toBe(202);
    const record = SetpointRecordSchema.parse(response.json());
    expect(record).toMatchObject({
      status: "sent",
      mode: "manual",
      requestedBatteryShare: 70,
      appliedBatteryShare: null,
      author: OPERATOR,
    });

    expect(ctx.published).toHaveLength(1);
    const [message] = ctx.published;
    expect(message?.topic).toBe("solar/SITE01/setpoint");
    expect(message?.options).toEqual({ qos: 1, retain: true });
    // Le message respecte le schéma Setpoint et porte l'identifiant de la consigne.
    expect(SetpointSchema.parse(message?.message)).toMatchObject({
      id: record.id,
      mode: "manual",
      batteryShare: 70,
    });
  });

  it("publie `batteryShare: null` hors mode manuel", async () => {
    const ctx = await setup();
    expect((await post(ctx, { mode: "discharge" })).statusCode).toBe(202);
    expect(SetpointSchema.parse(ctx.published[0]?.message).batteryShare).toBeNull();
    expect(ctx.rows[0]?.requestedBatteryShare).toBeNull();
  });

  it("refuse un lecteur (403) et une requête sans jeton (401), sans rien enregistrer", async () => {
    const ctx = await setup();
    const forbidden = await post(ctx, { mode: "automatic" }, ctx.viewer);
    expect(forbidden.statusCode).toBe(403);
    expect(code(forbidden)).toBe("FORBIDDEN");
    expect((await post(ctx, { mode: "automatic" }, {})).statusCode).toBe(401);
    expect(ctx.rows).toHaveLength(0);
    expect(ctx.published).toHaveLength(0);
  });

  it("refuse avec 409 DEVICE_OFFLINE si l'objet n'est pas en ligne", async () => {
    for (const status of ["offline", "unknown"] as const) {
      const ctx = await setup(status);
      const response = await post(ctx, { mode: "automatic" });
      expect(response.statusCode).toBe(409);
      expect(code(response)).toBe("DEVICE_OFFLINE");
      expect(ctx.rows).toHaveLength(0);
      expect(ctx.published).toHaveLength(0);
    }
  });

  it("refuse les valeurs invalides avec 422", async () => {
    const ctx = await setup();
    const invalid = [
      { mode: "manual" }, // part obligatoire en manuel
      { mode: "manual", batteryShare: 105 }, // hors bornes
      { mode: "manual", batteryShare: 45 }, // pas de 10 %
      { mode: "automatic", batteryShare: 50 }, // part interdite hors manuel
      { mode: "turbo" },
      {},
    ];
    for (const payload of invalid) {
      const response = await post(ctx, payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(422);
      expect(code(response)).toBe("INVALID_REQUEST");
    }
    expect(ctx.rows).toHaveLength(0);
  });

  it("renvoie 404 pour un site inconnu", async () => {
    const ctx = await setup();
    const response = await post(ctx, { mode: "automatic" }, ctx.operator, id(999));
    expect(response.statusCode).toBe(404);
    expect(code(response)).toBe("NOT_FOUND");
  });

  it("résout l'alerte setpoint_rejected active du site", async () => {
    const ctx = await setup();
    const first = SetpointRecordSchema.parse(
      (await post(ctx, { mode: "manual", batteryShare: 100 })).json(),
    );
    await ctx.service.recordState(
      SITE.code,
      stateMessage(first.id, {
        status: "rejected",
        appliedBatteryShare: null,
        reason: "battery_full",
      }),
      at(5),
    );
    expect(ctx.alerts).toMatchObject([{ type: "setpoint_rejected", status: "active" }]);

    await post(ctx, { mode: "automatic" });
    expect(ctx.alerts[0]?.status).toBe("resolved");
  });
});

describe("État appliqué (#42, diagramme 5.1)", () => {
  async function sent() {
    const ctx = await setup();
    const record = SetpointRecordSchema.parse(
      (await post(ctx, { mode: "manual", batteryShare: 70 })).json(),
    );
    return { ...ctx, setpointId: record.id };
  }

  it("sent → applied", async () => {
    const ctx = await sent();
    await ctx.service.recordState(SITE.code, stateMessage(ctx.setpointId), at(5));
    expect(ctx.rows[0]).toMatchObject({
      status: "applied",
      appliedBatteryShare: 70,
      rejectionReason: null,
      respondedAt: at(5),
    });
    expect(ctx.alerts).toHaveLength(0);
  });

  it("sent → partial, avec la part réduite et la raison", async () => {
    const ctx = await sent();
    await ctx.service.recordState(
      SITE.code,
      stateMessage(ctx.setpointId, {
        status: "partial",
        appliedBatteryShare: 50,
        reason: "charge_limit",
      }),
      at(5),
    );
    expect(ctx.rows[0]).toMatchObject({
      status: "partial",
      appliedBatteryShare: 50,
      rejectionReason: "charge_limit",
    });
    expect(ctx.alerts).toHaveLength(0);
  });

  it("sent → rejected : raison enregistrée et alerte setpoint_rejected ouverte", async () => {
    const ctx = await sent();
    await ctx.service.recordState(
      SITE.code,
      stateMessage(ctx.setpointId, {
        status: "rejected",
        appliedBatteryShare: null,
        reason: "battery_full",
      }),
      at(5),
    );
    expect(ctx.rows[0]).toMatchObject({ status: "rejected", rejectionReason: "battery_full" });
    expect(ctx.alerts).toEqual([
      {
        siteId: SITE.id,
        type: "setpoint_rejected",
        severity: "warning",
        message: "Consigne refusée sur Parc de démo : la batterie est pleine",
        status: "active",
      },
    ]);
  });

  it("no_response → réponse tardive : prend le statut de la réponse et résout l'alerte", async () => {
    const ctx = await sent();
    await ctx.service.checkResponseTimeouts(at(SETPOINT_RESPONSE_TIMEOUT_S + 1));
    expect(ctx.rows[0]?.status).toBe("no_response");
    expect(ctx.alerts).toMatchObject([{ type: "setpoint_no_response", status: "active" }]);

    await ctx.service.recordState(SITE.code, stateMessage(ctx.setpointId), at(45));
    expect(ctx.rows[0]).toMatchObject({ status: "applied", respondedAt: at(45) });
    expect(ctx.alerts[0]?.status).toBe("resolved");
  });

  it("seule la première réponse compte", async () => {
    const ctx = await sent();
    await ctx.service.recordState(SITE.code, stateMessage(ctx.setpointId), at(5));
    await ctx.service.recordState(
      SITE.code,
      stateMessage(ctx.setpointId, {
        status: "rejected",
        appliedBatteryShare: null,
        reason: "battery_full",
      }),
      at(60),
    );
    expect(ctx.rows[0]).toMatchObject({ status: "applied", respondedAt: at(5) });
    expect(ctx.alerts).toHaveLength(0);
  });

  it("une réponse d'un autre identifiant ne modifie aucune consigne", async () => {
    const ctx = await sent();
    await ctx.service.recordState(SITE.code, stateMessage(id(4242)), at(5));
    await ctx.service.recordState(SITE.code, stateMessage(null), at(6));
    expect(ctx.rows[0]).toMatchObject({ status: "sent", respondedAt: null });
  });

  it("la réponse à une consigne remplacée ne modifie pas l'ancienne", async () => {
    const ctx = await sent();
    await post(ctx, { mode: "automatic" });
    await ctx.service.recordState(SITE.code, stateMessage(ctx.setpointId), at(5));
    expect(ctx.rows.map((r) => r.status)).toEqual(["sent", "sent"]);
  });

  it("ignore un site inconnu", async () => {
    const ctx = await sent();
    await ctx.service.recordState("AUTRE", stateMessage(ctx.setpointId), at(5));
    expect(ctx.rows[0]?.status).toBe("sent");
  });
});

describe("Délai de réponse (#43)", () => {
  it("passe en no_response une consigne sent depuis 30 s, pas avant", async () => {
    const ctx = await setup();
    await post(ctx, { mode: "automatic" }); // créée à START
    expect(await ctx.service.checkResponseTimeouts(at(SETPOINT_RESPONSE_TIMEOUT_S))).toBe(0);
    expect(ctx.rows[0]?.status).toBe("sent");

    expect(await ctx.service.checkResponseTimeouts(at(SETPOINT_RESPONSE_TIMEOUT_S + 1))).toBe(1);
    expect(ctx.rows[0]?.status).toBe("no_response");
    expect(ctx.alerts).toEqual([
      {
        siteId: SITE.id,
        type: "setpoint_no_response",
        severity: "critical",
        message: "L'objet du site Parc de démo ne répond pas à la consigne",
        status: "active",
      },
    ]);
  });

  it("ne retraite pas une consigne déjà sans réponse ni répondue", async () => {
    const ctx = await setup();
    const record = SetpointRecordSchema.parse((await post(ctx, { mode: "automatic" })).json());
    await ctx.service.recordState(SITE.code, stateMessage(record.id, { mode: "automatic" }), at(5));
    expect(await ctx.service.checkResponseTimeouts(at(600))).toBe(0);
    expect(ctx.rows[0]?.status).toBe("applied");
  });

  it("rattrape au démarrage les consignes restées sent pendant l'arrêt de l'API", async () => {
    const ctx = await setup();
    await post(ctx, { mode: "automatic" });
    // Nouveau service sur le même dépôt : l'état n'est pas en mémoire, il vient de la base.
    const restarted = createSetpointsService(ctx.repository, async () => undefined, ctx.sink);
    expect(await restarted.checkResponseTimeouts(at(3600))).toBe(1);
    expect(ctx.rows[0]?.status).toBe("no_response");
  });
});

describe("GET /v1/sites/{id}/setpoints (#44)", () => {
  async function withHistory(count: number) {
    const ctx = await setup();
    for (let i = 0; i < count; i++) {
      await post(ctx, { mode: "manual", batteryShare: (i % 11) * 10 });
    }
    return ctx;
  }
  const get = (ctx: Awaited<ReturnType<typeof setup>>, query = "", headers = ctx.viewer) =>
    ctx.app.inject({ url: `/v1/sites/${SITE.id}/setpoints${query}`, headers });

  it("liste du plus récent au plus ancien, avec l'auteur", async () => {
    const ctx = await withHistory(3);
    const response = await get(ctx);
    expect(response.statusCode).toBe(200);
    const page = SetpointPageSchema.parse(response.json());
    expect(page.items.map((s) => s.id)).toEqual([id(1002), id(1001), id(1000)]);
    expect(page.items[0]?.author).toEqual(OPERATOR);
    expect(page.next).toBeNull();
  });

  it("pagine par curseur sur 25 consignes, sans doublon ni oubli", async () => {
    const ctx = await withHistory(25);
    const seen: string[] = [];
    let before = "";
    const sizes: number[] = [];
    for (let guard = 0; guard < 5; guard++) {
      const page = SetpointPageSchema.parse(
        (await get(ctx, `?limit=10${before && `&before=${before}`}`)).json(),
      );
      sizes.push(page.items.length);
      seen.push(...page.items.map((s) => s.id));
      if (!page.next) break;
      before = page.next;
    }
    expect(sizes).toEqual([10, 10, 5]);
    expect(new Set(seen).size).toBe(25);
    expect(seen[0]).toBe(id(1024));
    expect(seen[24]).toBe(id(1000));
  });

  it("valeurs par défaut : 20 par page, curseur fourni s'il en reste", async () => {
    const ctx = await withHistory(25);
    const page = SetpointPageSchema.parse((await get(ctx)).json());
    expect(page.items).toHaveLength(20);
    expect(page.next).not.toBeNull();
  });

  it("401 sans jeton, 404 site inconnu, 422 paramètres invalides ; un lecteur peut lire", async () => {
    const ctx = await withHistory(1);
    expect((await get(ctx)).statusCode).toBe(200);
    expect((await get(ctx, "", {} as never)).statusCode).toBe(401);
    expect((await get(ctx, "?limit=0")).statusCode).toBe(422);
    expect((await get(ctx, "?before=hier")).statusCode).toBe(422);
    const unknown = await ctx.app.inject({
      url: `/v1/sites/${id(999)}/setpoints`,
      headers: ctx.viewer,
    });
    expect(unknown.statusCode).toBe(404);
  });
});
