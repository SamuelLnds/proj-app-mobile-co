import { ErrorResponseSchema, LoginResponseSchema, UserSchema } from "@solar/contracts";
import argon2 from "argon2";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildServer } from "../../server";
import { createControlStateStore } from "../sites/control-states";
import type { SitesRepository } from "../sites/repository";
import { createSitesService } from "../sites/service";
import { TOKEN_TTL_S } from "./plugin";
import type { AuthRepository, UserRow } from "./repository";
import { LOGIN_ATTEMPTS_PER_MINUTE } from "./routes";
import { createAuthService } from "./service";

const PASSWORD = "mot-de-passe-de-test";
let OPERATOR: UserRow;
let VIEWER: UserRow;

beforeAll(async () => {
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const base = { passwordHash, createdAt: new Date("2026-11-01T00:00:00Z") };
  OPERATOR = {
    ...base,
    id: "00000000-0000-4000-8000-000000000001",
    email: "operator@demo.local",
    name: "Exploitant",
    role: "operator",
  };
  VIEWER = {
    ...base,
    id: "00000000-0000-4000-8000-000000000002",
    email: "viewer@demo.local",
    name: "Lecteur",
    role: "viewer",
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const emptySites: SitesRepository = {
  listSites: async () => [],
  findSite: async () => null,
  findDevice: async () => null,
  findLatestMeasurement: async () => null,
  countActiveAlerts: async () => 0,
  findLatestSetpoint: async () => null,
};

function server() {
  const users = [OPERATOR, VIEWER];
  const repository: AuthRepository = {
    findUserByEmail: async (email) =>
      users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null,
    findUserById: async (id) => users.find((u) => u.id === id) ?? null,
  };
  return buildServer({
    config: { LOG_LEVEL: "silent", NODE_ENV: "test" },
    checkDatabase: async () => true,
    auth: { service: createAuthService(repository), jwtSecret: "x".repeat(32) },
    sites: createSitesService(emptySites, createControlStateStore()),
  });
}

function login(app: ReturnType<typeof server>, email: string, password: string) {
  return app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });
}

function errorCode(response: { json: () => unknown }) {
  return ErrorResponseSchema.parse(response.json()).error.code;
}

describe("POST /v1/auth/login", () => {
  it("renvoie un jeton de 8 h et l'utilisateur", async () => {
    const response = await login(server(), "Operator@Demo.local", PASSWORD);
    expect(response.statusCode).toBe(200);
    const body = LoginResponseSchema.parse(response.json());
    expect(body.user).toEqual({
      id: OPERATOR.id,
      email: OPERATOR.email,
      name: "Exploitant",
      role: "operator",
    });
    const ttl = (new Date(body.expiresAt).getTime() - Date.now()) / 1000;
    expect(ttl).toBeGreaterThan(TOKEN_TTL_S - 5);
    expect(ttl).toBeLessThanOrEqual(TOKEN_TTL_S);
  });

  it("renvoie 401 INVALID_CREDENTIALS sans distinguer l'e-mail du mot de passe", async () => {
    const app = server();
    const wrongPassword = await login(app, OPERATOR.email, "mauvais");
    const unknownEmail = await login(app, "inconnu@demo.local", PASSWORD);
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(errorCode(wrongPassword)).toBe("INVALID_CREDENTIALS");
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
  });

  it("renvoie 422 pour un corps invalide", async () => {
    const response = await login(server(), "pas-un-email", "");
    expect(response.statusCode).toBe(422);
    expect(errorCode(response)).toBe("INVALID_REQUEST");
  });

  it(`renvoie 429 TOO_MANY_ATTEMPTS à la tentative n° ${LOGIN_ATTEMPTS_PER_MINUTE + 1} en une minute`, async () => {
    const app = server();
    for (let i = 0; i < LOGIN_ATTEMPTS_PER_MINUTE; i++) {
      expect((await login(app, OPERATOR.email, "mauvais")).statusCode).toBe(401);
    }
    const blocked = await login(app, OPERATOR.email, PASSWORD);
    expect(blocked.statusCode).toBe(429);
    expect(errorCode(blocked)).toBe("TOO_MANY_ATTEMPTS");
  });
});

describe("routes protégées", () => {
  it("GET /v1/auth/me renvoie l'utilisateur du jeton", async () => {
    const app = server();
    const { token } = LoginResponseSchema.parse((await login(app, VIEWER.email, PASSWORD)).json());
    const response = await app.inject({
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(UserSchema.parse(response.json()).role).toBe("viewer");
  });

  it("renvoie 401 UNAUTHENTICATED sans jeton ou avec un jeton invalide", async () => {
    const app = server();
    for (const headers of [{}, { authorization: "Bearer pas-un-jeton" }]) {
      for (const url of ["/v1/auth/me", "/v1/sites"]) {
        const response = await app.inject({ url, headers });
        expect(response.statusCode).toBe(401);
        expect(errorCode(response)).toBe("UNAUTHENTICATED");
      }
    }
  });

  it("renvoie 401 UNAUTHENTICATED avec un jeton expiré", async () => {
    const app = server();
    const { token } = LoginResponseSchema.parse((await login(app, VIEWER.email, PASSWORD)).json());
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + (TOKEN_TTL_S + 60) * 1000);
    const response = await app.inject({
      url: "/v1/sites",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe("UNAUTHENTICATED");
  });

  it("laisse /v1/health accessible sans jeton et ouvre /v1/sites avec un jeton", async () => {
    const app = server();
    expect((await app.inject({ url: "/v1/health" })).statusCode).toBe(200);
    const { token } = LoginResponseSchema.parse((await login(app, VIEWER.email, PASSWORD)).json());
    const response = await app.inject({
      url: "/v1/sites",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
  });
});

describe("service d'authentification", () => {
  const repository = (users: UserRow[]): AuthRepository => ({
    findUserByEmail: async (email) => users.find((u) => u.email === email) ?? null,
    findUserById: async (id) => users.find((u) => u.id === id) ?? null,
  });

  it("refuse un e-mail inconnu avec la même erreur qu'un mauvais mot de passe", async () => {
    const service = createAuthService(repository([OPERATOR]));
    await expect(
      service.verifyCredentials({ email: "inconnu@demo.local", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(
      service.verifyCredentials({ email: OPERATOR.email, password: "faux" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("ne renvoie jamais le haché du mot de passe", async () => {
    const user = await createAuthService(repository([OPERATOR])).verifyCredentials({
      email: OPERATOR.email,
      password: PASSWORD,
    });
    expect(user).toEqual({
      id: OPERATOR.id,
      email: OPERATOR.email,
      name: OPERATOR.name,
      role: "operator",
    });
  });

  it("refuse le jeton d'un compte supprimé depuis (401 UNAUTHENTICATED)", async () => {
    const service = createAuthService(repository([]));
    await expect(service.getUser(OPERATOR.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
