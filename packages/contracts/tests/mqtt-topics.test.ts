import { describe, expect, it } from "vitest";
import {
  panelMeasurementsTopic,
  parseTopic,
  setpointTopic,
  siteMeasurementsTopic,
  stateTopic,
  statusTopic,
} from "../src/index";

describe("construction des topics", () => {
  it("produit les topics de la section 6.1", () => {
    expect(siteMeasurementsTopic("SITE01")).toBe("solar/SITE01/measurements");
    expect(panelMeasurementsTopic("SITE01", "P07")).toBe("solar/SITE01/panels/P07/measurements");
    expect(setpointTopic("SITE01")).toBe("solar/SITE01/setpoint");
    expect(stateTopic("SITE01")).toBe("solar/SITE01/state");
    expect(statusTopic("SITE01")).toBe("solar/SITE01/status");
  });

  it("refuse un code invalide avec une erreur explicite", () => {
    expect(() => siteMeasurementsTopic("site/01")).toThrow(/Code de site invalide/);
    expect(() => panelMeasurementsTopic("SITE01", "X1")).toThrow(/Code de panneau invalide/);
  });
});

describe("analyse des topics", () => {
  it("extrait le code du site", () => {
    expect(parseTopic("solar/SITE01/measurements")).toEqual({
      ok: true,
      kind: "site-measurements",
      siteCode: "SITE01",
    });
    expect(parseTopic("solar/SITE01/setpoint")).toMatchObject({ ok: true, kind: "setpoint" });
    expect(parseTopic("solar/SITE01/state")).toMatchObject({ ok: true, kind: "state" });
    expect(parseTopic("solar/SITE01/status")).toMatchObject({ ok: true, kind: "status" });
  });

  it("extrait les codes du site et du panneau", () => {
    expect(parseTopic("solar/SITE01/panels/P07/measurements")).toEqual({
      ok: true,
      kind: "panel-measurements",
      siteCode: "SITE01",
      panelCode: "P07",
    });
  });

  it("est cohérente avec la construction", () => {
    expect(parseTopic(panelMeasurementsTopic("SITE02", "P120"))).toMatchObject({
      siteCode: "SITE02",
      panelCode: "P120",
    });
  });

  it.each([
    ["", /solar\//],
    ["other/SITE01/measurements", /solar\//],
    ["solar/site01/measurements", /code de site/],
    ["solar/SITE01/unknown", /ressource "unknown" inconnue/],
    ["solar/SITE01/constructor", /inconnue/],
    ["solar/SITE01/panels/Z9/measurements", /code de panneau/],
    ["solar/SITE01/panels/P07/state", /structure non reconnue/],
    ["solar/SITE01/measurements/extra", /structure non reconnue/],
    ["solar/SITE01", /structure non reconnue/],
  ])("refuse %j avec une erreur explicite", (topic, message) => {
    const result = parseTopic(topic);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(message);
    }
  });
});
