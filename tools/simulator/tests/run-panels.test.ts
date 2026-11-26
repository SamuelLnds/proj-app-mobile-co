import { EventEmitter } from "node:events";
import { PANEL_MEASUREMENT_PERIOD_S, PanelMeasurementSchema } from "@solar/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPanelMeasurement, panelCodesToPublish } from "../src/panels/panel-measurement";
import { startPanelsMode, type PanelsClient } from "../src/panels/run-panels";

type Published = { topic: string; payload: string; options: { qos?: number; retain?: boolean } };

/** Faux client MQTT : enregistre publications et abonnements, et permet d'émettre des messages. */
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
  } as unknown as PanelsClient;
  return { client, emitter, published, subscriptions };
}

function siteMeasurement(irradiance: number) {
  return {
    v: 1,
    timestamp: "2026-01-01T10:00:00.000Z",
    irradiance,
    production: irradiance * 4,
    temperature: 25,
    batteryLevel: 50,
    batteryPower: 0,
    gridPower: 0,
    mode: "automatic",
    simulatedFault: false,
  };
}

function receiveSite(emitter: EventEmitter, irradiance: number): void {
  emitter.emit(
    "message",
    "solar/SITE01/measurements",
    Buffer.from(JSON.stringify(siteMeasurement(irradiance))),
  );
}

const PERIOD_MS = PANEL_MEASUREMENT_PERIOD_S * 1000;

describe("panelCodesToPublish", () => {
  it("donne P01 à P20 puis les panneaux supplémentaires, sans doublon", () => {
    const codes = panelCodesToPublish(["P21", "P05"]);
    expect(codes).toHaveLength(21);
    expect(codes[0]).toBe("P01");
    expect(codes[19]).toBe("P20");
    expect(codes[20]).toBe("P21");
  });
});

describe("buildPanelMeasurement", () => {
  const now = new Date("2026-01-01T10:00:00.000Z");

  it("produit ensoleillement × 200 / 1000 à ± 5 %", () => {
    const low = buildPanelMeasurement({ irradiance: 800, faulty: false, random: 0, now });
    const high = buildPanelMeasurement({ irradiance: 800, faulty: false, random: 0.999999, now });
    expect(low.production).toBeCloseTo(152, 1);
    expect(high.production).toBeCloseTo(168, 1);
  });

  it("divise par 5 la production d'un panneau en panne", () => {
    const normal = buildPanelMeasurement({ irradiance: 800, faulty: false, random: 0.5, now });
    const faulty = buildPanelMeasurement({ irradiance: 800, faulty: true, random: 0.5, now });
    expect(normal.production / faulty.production).toBeCloseTo(5, 1);
  });

  it("donne 0 W la nuit, avec une température valide", () => {
    const night = buildPanelMeasurement({ irradiance: 0, faulty: false, random: 0.3, now });
    expect(night.production).toBe(0);
    expect(PanelMeasurementSchema.safeParse(night).success).toBe(true);
  });
});

describe("startPanelsMode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const options = { siteCode: "SITE01", faultyPanels: [] as string[], extraPanels: [] as string[] };

  it("s'abonne aux mesures du site à chaque connexion", () => {
    const { client, emitter, subscriptions } = fakeClient();
    const stop = startPanelsMode(client, options);
    emitter.emit("connect");
    emitter.emit("connect");
    expect(subscriptions).toEqual(["solar/SITE01/measurements", "solar/SITE01/measurements"]);
    stop();
  });

  it("ne publie rien tant qu'aucun ensoleillement n'a été reçu", () => {
    const { client, published } = fakeClient();
    const stop = startPanelsMode(client, options);
    vi.advanceTimersByTime(PERIOD_MS * 3);
    expect(published).toHaveLength(0);
    stop();
  });

  it("publie 20 messages valides (QoS 0, non retained) à chaque cycle", () => {
    const { client, emitter, published } = fakeClient();
    const stop = startPanelsMode(client, options);
    receiveSite(emitter, 800);

    vi.advanceTimersByTime(PERIOD_MS - 1);
    expect(published).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(published).toHaveLength(20);
    vi.advanceTimersByTime(PERIOD_MS);
    expect(published).toHaveLength(40);

    const topics = new Set(published.map((m) => m.topic));
    expect(topics.size).toBe(20);
    expect(topics.has("solar/SITE01/panels/P01/measurements")).toBe(true);
    expect(topics.has("solar/SITE01/panels/P20/measurements")).toBe(true);
    for (const message of published) {
      expect(message.options).toMatchObject({ qos: 0 });
      expect(message.options.retain).toBeFalsy();
      expect(PanelMeasurementSchema.safeParse(JSON.parse(message.payload)).success).toBe(true);
    }
    stop();
  });

  it("publie un message de plus par panneau de EXTRA_PANELS", () => {
    const { client, emitter, published } = fakeClient();
    const stop = startPanelsMode(client, { ...options, extraPanels: ["P21", "P22"] });
    receiveSite(emitter, 800);
    vi.advanceTimersByTime(PERIOD_MS);
    expect(published).toHaveLength(22);
    const topics = published.map((m) => m.topic);
    expect(topics).toContain("solar/SITE01/panels/P21/measurements");
    expect(topics).toContain("solar/SITE01/panels/P22/measurements");
    stop();
  });

  it("les panneaux en panne produisent environ 5 fois moins que les autres", () => {
    const { client, emitter, published } = fakeClient();
    const stop = startPanelsMode(client, { ...options, faultyPanels: ["P07", "P12"] });
    receiveSite(emitter, 800);
    vi.advanceTimersByTime(PERIOD_MS);

    const production = (code: string): number =>
      PanelMeasurementSchema.parse(
        JSON.parse(published.find((m) => m.topic.includes(`/${code}/`))!.payload),
      ).production;
    const healthy = ["P01", "P02", "P03", "P04"].map(production);
    const average = healthy.reduce((sum, value) => sum + value, 0) / healthy.length;
    for (const code of ["P07", "P12"]) {
      expect(average / production(code)).toBeGreaterThan(4);
      expect(average / production(code)).toBeLessThan(6);
    }
    stop();
  });

  it("suit la dernière mesure du site reçue", () => {
    const { client, emitter, published } = fakeClient();
    const stop = startPanelsMode(client, options, undefined, () => 0.5);
    receiveSite(emitter, 1000);
    vi.advanceTimersByTime(PERIOD_MS);
    receiveSite(emitter, 0);
    vi.advanceTimersByTime(PERIOD_MS);
    const productions = published.map(
      (m) => PanelMeasurementSchema.parse(JSON.parse(m.payload)).production,
    );
    expect(productions.slice(0, 20).every((p) => p === 200)).toBe(true);
    expect(productions.slice(20).every((p) => p === 0)).toBe(true);
    stop();
  });

  it("ignore avec un avertissement une mesure du site invalide, sans s'arrêter", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, emitter, published } = fakeClient();
    const stop = startPanelsMode(client, options);

    emitter.emit("message", "solar/SITE01/measurements", Buffer.from("pas du json"));
    emitter.emit(
      "message",
      "solar/SITE01/measurements",
      Buffer.from(JSON.stringify({ ...siteMeasurement(800), v: 2 })),
    );
    emitter.emit(
      "message",
      "solar/SITE01/measurements",
      Buffer.from(JSON.stringify({ ...siteMeasurement(800), irradiance: -5 })),
    );
    vi.advanceTimersByTime(PERIOD_MS);

    expect(warn).toHaveBeenCalledTimes(3);
    expect(published).toHaveLength(0);

    // Une mesure invalide ne remplace pas la dernière valeur valide.
    receiveSite(emitter, 800);
    emitter.emit("message", "solar/SITE01/measurements", Buffer.from("{"));
    vi.advanceTimersByTime(PERIOD_MS);
    expect(published).toHaveLength(20);
    stop();
  });

  it("ne publie pas quand le client est déconnecté", () => {
    const { client, emitter, published } = fakeClient();
    const stop = startPanelsMode(client, options);
    receiveSite(emitter, 800);
    (client as { connected: boolean }).connected = false;
    vi.advanceTimersByTime(PERIOD_MS);
    expect(published).toHaveLength(0);
    stop();
  });
});
