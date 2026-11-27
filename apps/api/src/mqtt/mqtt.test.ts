import { EventEmitter } from "node:events";
import { API_SUBSCRIPTIONS, MESSAGE_VERSION } from "@solar/contracts";
import type { FastifyBaseLogger } from "fastify";
import type { MqttClient } from "mqtt";
import { describe, expect, it, vi } from "vitest";
import { buildServer } from "../server";
import { createMqttClient } from "./client";
import { createMessageHandler } from "./handlers";

function fakeLogger() {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    level: "info",
    silent: vi.fn(),
    child: () => logger,
  };
  return logger as unknown as FastifyBaseLogger & { warn: ReturnType<typeof vi.fn> };
}

/** Faux client mqtt.js : mémorise les abonnements et simule la connexion. */
function fakeMqtt() {
  const emitter = new EventEmitter() as EventEmitter & {
    connected: boolean;
    subscribe: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  emitter.connected = false;
  emitter.subscribe = vi.fn((_topics, _options, callback: (error: Error | null) => void) =>
    callback(null),
  );
  emitter.publish = vi.fn((_topic, _payload, _options, callback: (error?: Error) => void) =>
    callback(),
  );
  emitter.end = vi.fn((_force, _options, callback: () => void) => callback());
  return emitter;
}

const measurement = {
  v: MESSAGE_VERSION,
  timestamp: "2026-11-23T10:00:00Z",
  irradiance: 800,
  production: 3200,
  temperature: 31.5,
  batteryLevel: 62,
  batteryPower: 900,
  gridPower: 2300,
  mode: "manual",
  simulatedFault: false,
};

describe("client MQTT de l'API", () => {
  it("s'abonne aux 4 topics à la connexion et l'état du broker remonte dans /v1/health", async () => {
    const fake = fakeMqtt();
    const client = createMqttClient(
      { url: "mqtt://127.0.0.1:1883", username: "api", password: "secret" },
      () => {},
      fakeLogger(),
      () => fake as unknown as MqttClient,
    );
    const app = buildServer({
      config: { LOG_LEVEL: "silent", NODE_ENV: "test" },
      checkDatabase: async () => true,
      checkBroker: client.isConnected,
    });

    expect((await app.inject({ url: "/v1/health" })).json().broker).toBe("down");

    fake.connected = true;
    fake.emit("connect");
    expect(fake.subscribe).toHaveBeenCalledWith(
      [...API_SUBSCRIPTIONS],
      { qos: 1 },
      expect.any(Function),
    );
    expect(API_SUBSCRIPTIONS).toHaveLength(4);
    expect((await app.inject({ url: "/v1/health" })).json().broker).toBe("up");
  });

  it("publie un message JSON avec la qualité de service demandée", async () => {
    const fake = fakeMqtt();
    const client = createMqttClient(
      { url: "mqtt://127.0.0.1:1883", username: "api", password: "secret" },
      () => {},
      fakeLogger(),
      () => fake as unknown as MqttClient,
    );
    await client.publish("solar/SITE01/setpoint", { v: 1 }, { qos: 1, retain: true });
    expect(fake.publish).toHaveBeenCalledWith(
      "solar/SITE01/setpoint",
      '{"v":1}',
      { qos: 1, retain: true },
      expect.any(Function),
    );
  });
});

describe("aiguillage des messages MQTT", () => {
  it("transmet une mesure valide au service avec le code du site", async () => {
    const siteMeasurement = vi.fn(async () => {});
    const handle = createMessageHandler({ siteMeasurement }, fakeLogger());
    await handle("solar/SITE01/measurements", Buffer.from(JSON.stringify(measurement)));
    expect(siteMeasurement).toHaveBeenCalledWith("SITE01", measurement, expect.any(Date));
  });

  it.each([
    ["JSON illisible", "solar/SITE01/measurements", "{pas du json"],
    ["format invalide", "solar/SITE01/measurements", JSON.stringify({ ...measurement, v: 2 })],
    ["topic inconnu", "solar/SITE01/inconnu", JSON.stringify(measurement)],
  ])(
    "ignore et journalise un message invalide (%s) sans lever d'erreur",
    async (_cas, topic, body) => {
      const logger = fakeLogger();
      const siteMeasurement = vi.fn(async () => {});
      const handle = createMessageHandler({ siteMeasurement }, logger);
      await expect(handle(topic, Buffer.from(body))).resolves.toBeUndefined();
      expect(siteMeasurement).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledOnce();
    },
  );

  it("journalise l'erreur d'un service sans la propager", async () => {
    const logger = fakeLogger();
    const handle = createMessageHandler(
      {
        siteMeasurement: async () => {
          throw new Error("base indisponible");
        },
      },
      logger,
    );
    await expect(
      handle("solar/SITE01/measurements", Buffer.from(JSON.stringify(measurement))),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
