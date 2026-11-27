import { describe, expect, it } from "vitest";
import { ErrorResponseSchema, HealthResponseSchema } from "@solar/contracts";
import { loadConfig } from "./config";
import { buildServer } from "./server";

const baseConfig = { LOG_LEVEL: "silent", NODE_ENV: "test" } as const;
const validEnv = {
  DATABASE_URL: "postgres://solar:x@localhost:5432/solar",
  JWT_SECRET: "x".repeat(32),
  MQTT_URL: "mqtt://localhost:1883",
  MQTT_USERNAME: "api",
  MQTT_PASSWORD: "x",
};

describe("GET /v1/health", () => {
  it("renvoie 200 avec status, database et broker", async () => {
    const app = buildServer({ config: baseConfig, checkDatabase: async () => true });
    const response = await app.inject({ method: "GET", url: "/v1/health" });
    expect(response.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(response.json());
    // Pas encore de client MQTT : le broker est signalé indisponible.
    expect(body).toEqual({ status: "degraded", database: "up", broker: "down" });
  });

  it("signale la base indisponible", async () => {
    const app = buildServer({
      config: baseConfig,
      checkDatabase: async () => {
        throw new Error("connexion refusée");
      },
      checkBroker: () => true,
    });
    const response = await app.inject({ method: "GET", url: "/v1/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "degraded", database: "down", broker: "up" });
  });

  it("renvoie ok quand la base et le broker répondent", async () => {
    const app = buildServer({
      config: baseConfig,
      checkDatabase: async () => true,
      checkBroker: () => true,
    });
    const response = await app.inject({ method: "GET", url: "/v1/health" });
    expect(response.json()).toEqual({ status: "ok", database: "up", broker: "up" });
  });
});

describe("route inconnue", () => {
  it("renvoie 404 au format d'erreur défini", async () => {
    const app = buildServer({ config: baseConfig, checkDatabase: async () => true });
    const response = await app.inject({ method: "GET", url: "/v1/inconnue" });
    expect(response.statusCode).toBe(404);
    const body = ErrorResponseSchema.parse(response.json());
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.details).toBeNull();
  });
});

describe("loadConfig", () => {
  it("accepte une configuration complète", () => {
    expect(loadConfig(validEnv).PORT).toBe(3000);
  });

  it("refuse de démarrer si une variable manque", () => {
    const { DATABASE_URL: _omitted, ...incomplete } = validEnv;
    expect(() => loadConfig(incomplete)).toThrow(/DATABASE_URL/);
  });

  it("refuse un secret JWT trop court", () => {
    expect(() => loadConfig({ ...validEnv, JWT_SECRET: "court" })).toThrow(/JWT_SECRET/);
  });
});
