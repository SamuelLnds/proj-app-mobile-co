import { ErrorResponseSchema, LoginResponseSchema } from "@solar/contracts";
import argon2 from "argon2";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildServer } from "../../server";
import type { AlertRow } from "../alerts/repository";
import type { AuthRepository, UserRow } from "../auth/repository";
import { createAuthService } from "../auth/service";
import type { PushTokensRepository } from "./repository";
import type { PushMessage, PushResult, PushSender } from "./sender";
import { alertNotification, createPushService } from "./service";

const NOW = new Date("2026-11-26T10:00:00Z");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TOKEN_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const TOKEN_B = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";

/** Dépôt en mémoire : un jeton n'a qu'un propriétaire. */
function fakeRepository() {
  const tokens = new Map<string, { userId: string; platform: string }>();
  const repository: PushTokensRepository = {
    upsert: async (userId, token, platform) => {
      tokens.set(token, { userId, platform });
    },
    remove: async (userId, token) => {
      if (tokens.get(token)?.userId === userId) tokens.delete(token);
    },
    listTokens: async () => [...tokens.keys()],
    removeTokens: async (list) => {
      for (const token of list) tokens.delete(token);
    },
  };
  return { repository, tokens };
}

function alert(overrides: Partial<AlertRow> = {}): AlertRow {
  return {
    id: id(500),
    siteId: id(1),
    panelId: null,
    type: "device_offline",
    severity: "critical",
    message: "L'objet du site Parc de démo est hors ligne",
    status: "active",
    startedAt: NOW,
    endedAt: null,
    ...overrides,
  };
}

function setupService(results?: (messages: PushMessage[]) => PushResult[]) {
  const fake = fakeRepository();
  const sent: PushMessage[][] = [];
  const sender: PushSender = vi.fn(async (messages) => {
    sent.push(messages);
    return results ? results(messages) : messages.map(() => ({ ok: true as const }));
  });
  return { ...fake, sender, sent, service: createPushService(fake.repository, sender) };
}

describe("notification d'une alerte", () => {
  it("critical : un envoi groupé à tous les jetons enregistrés", async () => {
    const t = setupService();
    await t.service.register(id(10), { token: TOKEN_A, platform: "android" });
    await t.service.register(id(11), { token: TOKEN_B, platform: "ios" });
    const summary = await t.service.notifyAlert(alert());
    expect(summary).toEqual({ sent: 2, removed: 0 });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]?.map((m) => m.to)).toEqual([TOKEN_A, TOKEN_B]);
    expect(t.sent[0]?.[0]).toMatchObject({
      title: "Alerte critique",
      body: "L'objet du site Parc de démo est hors ligne",
      data: { alertId: id(500), siteId: id(1), panelId: null, type: "device_offline" },
    });
  });

  it("warning : notifie aussi, avec le titre « Alerte »", async () => {
    const t = setupService();
    await t.service.register(id(10), { token: TOKEN_A, platform: "android" });
    await t.service.notifyAlert(alert({ severity: "warning", type: "battery_low" }));
    expect(t.sent[0]?.[0]?.title).toBe("Alerte");
  });

  it("setpoint_rejected : aucun push, même en warning", async () => {
    const t = setupService();
    await t.service.register(id(10), { token: TOKEN_A, platform: "android" });
    expect(
      await t.service.notifyAlert(alert({ severity: "warning", type: "setpoint_rejected" })),
    ).toEqual({ sent: 0, removed: 0 });
    expect(t.sender).not.toHaveBeenCalled();
  });

  it("setpoint_no_response et device_offline : notifient en critique", async () => {
    const t = setupService();
    await t.service.register(id(10), { token: TOKEN_A, platform: "android" });
    await t.service.notifyAlert(alert({ type: "setpoint_no_response" }));
    await t.service.notifyAlert(alert({ type: "device_offline" }));
    expect(t.sent.map((messages) => messages[0]?.title)).toEqual([
      "Alerte critique",
      "Alerte critique",
    ]);
    expect(t.sent.map((messages) => messages[0]?.data.type)).toEqual([
      "setpoint_no_response",
      "device_offline",
    ]);
  });

  it("info : aucune notification", async () => {
    const t = setupService();
    await t.service.register(id(10), { token: TOKEN_A, platform: "android" });
    expect(await t.service.notifyAlert(alert({ severity: "info" }))).toEqual({
      sent: 0,
      removed: 0,
    });
    expect(t.sender).not.toHaveBeenCalled();
  });

  it("sans jeton enregistré : rien n'est envoyé", async () => {
    const t = setupService();
    await t.service.notifyAlert(alert());
    expect(t.sender).not.toHaveBeenCalled();
  });

  it("supprime les jetons refusés par Expo (DeviceNotRegistered), garde les autres", async () => {
    const t = setupService((messages) =>
      messages.map((m) =>
        m.to === TOKEN_A
          ? { ok: false as const, error: "DeviceNotRegistered" }
          : { ok: true as const },
      ),
    );
    await t.service.register(id(10), { token: TOKEN_A, platform: "android" });
    await t.service.register(id(11), { token: TOKEN_B, platform: "ios" });
    expect(await t.service.notifyAlert(alert())).toEqual({ sent: 1, removed: 1 });
    expect([...t.tokens.keys()]).toEqual([TOKEN_B]);
  });

  it("une autre erreur d'Expo ne supprime pas le jeton", async () => {
    const t = setupService((messages) =>
      messages.map(() => ({ ok: false as const, error: "MessageRateExceeded" })),
    );
    await t.service.register(id(10), { token: TOKEN_A, platform: "android" });
    await t.service.notifyAlert(alert());
    expect([...t.tokens.keys()]).toEqual([TOKEN_A]);
  });

  it("ne contient aucune donnée personnelle : ni e-mail ni nom d'utilisateur", async () => {
    const t = setupService();
    await t.service.register(id(10), { token: TOKEN_A, platform: "android" });
    await t.service.notifyAlert(alert({ panelId: id(107), type: "overheating" }));
    const content = JSON.stringify(t.sent);
    for (const personal of ["operator@demo.local", "viewer@demo.local", "Exploitant", "Lecteur"]) {
      expect(content).not.toContain(personal);
    }
    // Seuls le texte de l'alerte et des identifiants techniques sont transmis.
    expect(Object.keys(alertNotification(alert()))).toEqual(["title", "body", "data"]);
    expect(Object.keys(alertNotification(alert()).data).sort()).toEqual([
      "alertId",
      "panelId",
      "siteId",
      "type",
    ]);
  });
});

// --- POST et DELETE /v1/push-tokens ---------------------------------------------------------

let USERS: UserRow[];
beforeAll(async () => {
  const passwordHash = await argon2.hash("secret", { type: argon2.argon2id });
  USERS = [
    {
      id: id(10),
      email: "operator@demo.local",
      name: "Exploitant",
      role: "operator",
      passwordHash,
      createdAt: NOW,
    },
    {
      id: id(11),
      email: "viewer@demo.local",
      name: "Lecteur",
      role: "viewer",
      passwordHash,
      createdAt: NOW,
    },
  ];
});

async function setupServer() {
  const t = setupService();
  const auth: AuthRepository = {
    findUserByEmail: async (email) => USERS.find((u) => u.email === email) ?? null,
    findUserById: async (userId) => USERS.find((u) => u.id === userId) ?? null,
  };
  const app = buildServer({
    config: { LOG_LEVEL: "silent", NODE_ENV: "test" },
    checkDatabase: async () => true,
    auth: { service: createAuthService(auth), jwtSecret: "x".repeat(32) },
    push: t.service,
  });
  const login = async (role: "operator" | "viewer") => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: `${role}@demo.local`, password: "secret" },
    });
    return { authorization: `Bearer ${LoginResponseSchema.parse(response.json()).token}` };
  };
  return { ...t, app, operator: await login("operator"), viewer: await login("viewer") };
}

const post = (
  t: Awaited<ReturnType<typeof setupServer>>,
  payload: unknown,
  headers?: Record<string, string>,
) => t.app.inject({ method: "POST", url: "/v1/push-tokens", payload: payload as object, headers });

describe("POST /v1/push-tokens", () => {
  it("401 sans jeton d'accès", async () => {
    const t = await setupServer();
    const response = await post(t, { token: TOKEN_A, platform: "android" });
    expect(response.statusCode).toBe(401);
    expect(ErrorResponseSchema.parse(response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("422 sur un corps invalide", async () => {
    const t = await setupServer();
    for (const body of [
      {},
      { token: "", platform: "android" },
      { token: TOKEN_A, platform: "web" },
    ]) {
      const response = await post(t, body, t.viewer);
      expect(response.statusCode).toBe(422);
    }
    expect(t.tokens.size).toBe(0);
  });

  it("204 : enregistre le jeton, même pour un lecteur", async () => {
    const t = await setupServer();
    const response = await post(t, { token: TOKEN_A, platform: "android" }, t.viewer);
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(t.tokens.get(TOKEN_A)).toEqual({ userId: id(11), platform: "android" });
  });

  it("enregistrer deux fois le même jeton ne crée pas de doublon", async () => {
    const t = await setupServer();
    await post(t, { token: TOKEN_A, platform: "android" }, t.viewer);
    await post(t, { token: TOKEN_A, platform: "android" }, t.viewer);
    expect(t.tokens.size).toBe(1);
  });

  it("réattribue le jeton à l'utilisateur qui se connecte ensuite sur le même téléphone", async () => {
    const t = await setupServer();
    await post(t, { token: TOKEN_A, platform: "android" }, t.viewer);
    const response = await post(t, { token: TOKEN_A, platform: "android" }, t.operator);
    expect(response.statusCode).toBe(204);
    expect(t.tokens.size).toBe(1);
    expect(t.tokens.get(TOKEN_A)?.userId).toBe(id(10));
  });
});

describe("DELETE /v1/push-tokens/{token}", () => {
  const url = (token: string) => `/v1/push-tokens/${encodeURIComponent(token)}`;

  it("401 sans jeton d'accès", async () => {
    const t = await setupServer();
    const response = await t.app.inject({ method: "DELETE", url: url(TOKEN_A) });
    expect(response.statusCode).toBe(401);
  });

  it("204 : supprime le jeton de l'utilisateur (crochets du jeton Expo encodés)", async () => {
    const t = await setupServer();
    await post(t, { token: TOKEN_A, platform: "android" }, t.viewer);
    const response = await t.app.inject({ method: "DELETE", url: url(TOKEN_A), headers: t.viewer });
    expect(response.statusCode).toBe(204);
    expect(t.tokens.size).toBe(0);
  });

  it("204 aussi pour un jeton inconnu (suppression idempotente)", async () => {
    const t = await setupServer();
    const response = await t.app.inject({ method: "DELETE", url: url(TOKEN_B), headers: t.viewer });
    expect(response.statusCode).toBe(204);
  });

  it("ne supprime pas le jeton réattribué à un autre utilisateur", async () => {
    const t = await setupServer();
    await post(t, { token: TOKEN_A, platform: "android" }, t.viewer);
    await post(t, { token: TOKEN_A, platform: "android" }, t.operator);
    // Le premier utilisateur se déconnecte tardivement : le téléphone appartient à l'autre.
    await t.app.inject({ method: "DELETE", url: url(TOKEN_A), headers: t.viewer });
    expect(t.tokens.get(TOKEN_A)?.userId).toBe(id(10));
  });
});
