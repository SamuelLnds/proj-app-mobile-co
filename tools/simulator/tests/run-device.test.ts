import { EventEmitter } from "node:events";
import {
  ControlStateSchema,
  DeviceStatusSchema,
  SITE_MEASUREMENT_PERIOD_S,
  SiteMeasurementSchema,
} from "@solar/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config";
import { startDeviceMode, type DeviceClient } from "../src/device/run-device";
import { buildConnectOptions } from "../src/mqtt-client";
import { startSimulator } from "../src/simulator";

type Published = { topic: string; payload: string; options: { qos?: number; retain?: boolean } };

/** Faux client MQTT : enregistre les publications et les abonnements, et permet d'émettre des messages. */
function fakeClient() {
  const emitter = new EventEmitter();
  const published: Published[] = [];
  const subscriptions: string[] = [];
  const client = {
    connected: true,
    on: emitter.on.bind(emitter),
    publish: (topic: string, payload: string, options: Published["options"]) => {
      published.push({ topic, payload, options });
    },
    subscribe: (topic: string) => {
      subscriptions.push(topic);
    },
  } as unknown as DeviceClient;
  return { client, emitter, published, subscriptions };
}

function baseConfig(simulateDevice: boolean): Config {
  return {
    MQTT_URL: "mqtt://127.0.0.1:1883",
    MQTT_USERNAME: "simulator",
    MQTT_PASSWORD: "secret-de-test",
    SITE_CODE: "SITE01",
    SIMULATE_DEVICE: simulateDevice,
    FAULTY_PANELS: [],
    EXTRA_PANELS: [],
    DEVICE_NAME: "device-site01",
    API_URL: "http://127.0.0.1:3000/v1",
    DEVICE_MQTT_URL: "mqtts://localhost:8883",
    BROKER_CA_PATH: "ca.crt",
  };
}

const VALID_SETPOINT = {
  v: 1,
  id: "0b9d6c1e-6a3f-4f43-9d0e-3f6c8f7a2b11",
  mode: "manual",
  batteryShare: 50,
  issuedAt: "2026-01-01T10:00:00.000Z",
};

describe("startDeviceMode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("à la connexion : publie online (retained, QoS 1), s'abonne aux consignes et publie l'état", () => {
    const { client, emitter, published, subscriptions } = fakeClient();
    const stop = startDeviceMode(client, "SITE01");
    emitter.emit("connect");

    const status = published.find((m) => m.topic === "solar/SITE01/status");
    expect(status?.options).toMatchObject({ qos: 1, retain: true });
    expect(DeviceStatusSchema.parse(JSON.parse(status!.payload)).status).toBe("online");
    expect(subscriptions).toEqual(["solar/SITE01/setpoint"]);
    const state = published.find((m) => m.topic === "solar/SITE01/state");
    expect(state?.options).toMatchObject({ qos: 1, retain: true });
    expect(ControlStateSchema.safeParse(JSON.parse(state!.payload)).success).toBe(true);
    stop();
  });

  it("publie une mesure conforme au schéma toutes les SITE_MEASUREMENT_PERIOD_S secondes", () => {
    const { client, published } = fakeClient();
    const stop = startDeviceMode(client, "SITE01");

    vi.advanceTimersByTime((SITE_MEASUREMENT_PERIOD_S - 1) * 1000);
    expect(published.filter((m) => m.topic === "solar/SITE01/measurements")).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    const measurements = published.filter((m) => m.topic === "solar/SITE01/measurements");
    expect(measurements).toHaveLength(1);
    expect(measurements[0]?.options).toMatchObject({ qos: 0 });
    expect(SiteMeasurementSchema.safeParse(JSON.parse(measurements[0]!.payload)).success).toBe(
      true,
    );
    stop();
  });

  it("applique une consigne valide et publie l'état (retained, QoS 1)", () => {
    const { client, emitter, published } = fakeClient();
    const stop = startDeviceMode(client, "SITE01");
    emitter.emit("message", "solar/SITE01/setpoint", Buffer.from(JSON.stringify(VALID_SETPOINT)));

    expect(published).toHaveLength(1);
    expect(published[0]?.topic).toBe("solar/SITE01/state");
    expect(published[0]?.options).toMatchObject({ qos: 1, retain: true });
    expect(ControlStateSchema.parse(JSON.parse(published[0]!.payload))).toMatchObject({
      setpointId: VALID_SETPOINT.id,
      mode: "manual",
      status: "applied",
      appliedBatteryShare: 50,
    });
    stop();
  });

  it("ignore avec un avertissement une consigne invalide, sans s'arrêter", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, emitter, published } = fakeClient();
    const stop = startDeviceMode(client, "SITE01");

    emitter.emit("message", "solar/SITE01/setpoint", Buffer.from("pas du json"));
    emitter.emit(
      "message",
      "solar/SITE01/setpoint",
      Buffer.from(JSON.stringify({ ...VALID_SETPOINT, batteryShare: 15 })),
    );
    emitter.emit(
      "message",
      "solar/SITE01/setpoint",
      Buffer.from(JSON.stringify({ ...VALID_SETPOINT, v: 2 })),
    );

    expect(published).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(3);
    stop();
  });
});

describe("buildConnectOptions (connexion des panneaux)", () => {
  it("utilise l'identifiant du simulateur et ne porte jamais le Last Will de l'objet", () => {
    for (const simulateDevice of [true, false]) {
      const options = buildConnectOptions(baseConfig(simulateDevice));
      expect(options.username).toBe("simulator");
      expect(options.will).toBeUndefined();
    }
  });
});

describe("startSimulator", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sans SIMULATE_DEVICE : le mode objet ne publie rien et n'écoute pas les consignes", () => {
    const { client, emitter, published, subscriptions } = fakeClient();
    const startDevice = vi.fn(() => () => undefined);
    const stop = startSimulator(client, baseConfig(false), startDevice);
    expect(startDevice).not.toHaveBeenCalled();
    emitter.emit("connect");
    emitter.emit("message", "solar/SITE01/setpoint", Buffer.from(JSON.stringify(VALID_SETPOINT)));
    vi.advanceTimersByTime(60_000);

    // Seul le mode panneaux tourne : il s'abonne aux mesures du site, jamais aux consignes.
    expect(published).toHaveLength(0);
    expect(subscriptions).toEqual(["solar/SITE01/measurements"]);
    stop();
  });

  it("avec SIMULATE_DEVICE : l'objet est démarré sur sa propre connexion, jamais sur celle des panneaux", () => {
    const { client, emitter, published } = fakeClient();
    const stopDevice = vi.fn();
    const startDevice = vi.fn(() => stopDevice);
    const stop = startSimulator(client, baseConfig(true), startDevice);
    emitter.emit("connect");
    expect(startDevice).toHaveBeenCalledWith(baseConfig(true));
    expect(published.some((m) => m.topic === "solar/SITE01/status")).toBe(false);
    stop();
    expect(stopDevice).toHaveBeenCalled();
  });
});
