import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

/** Environnement valide de référence, copié puis modifié par chaque test. */
const validEnv = {
  MQTT_URL: "mqtt://127.0.0.1:1883",
  MQTT_USERNAME: "simulator",
  MQTT_PASSWORD: "secret-de-test",
  SITE_CODE: "SITE01",
};

describe("loadConfig", () => {
  it("lit les variables obligatoires et donne des listes vides pour les panneaux facultatifs", () => {
    const config = loadConfig({ ...validEnv });

    expect(config.MQTT_URL).toBe("mqtt://127.0.0.1:1883");
    expect(config.MQTT_USERNAME).toBe("simulator");
    expect(config.MQTT_PASSWORD).toBe("secret-de-test");
    expect(config.SITE_CODE).toBe("SITE01");
    expect(config.FAULTY_PANELS).toEqual([]);
    expect(config.EXTRA_PANELS).toEqual([]);
  });

  it("découpe FAULTY_PANELS et EXTRA_PANELS, en ignorant espaces et doublons", () => {
    const config = loadConfig({
      ...validEnv,
      FAULTY_PANELS: "P07, P12,P07",
      EXTRA_PANELS: "P21",
    });

    expect(config.FAULTY_PANELS).toEqual(["P07", "P12"]);
    expect(config.EXTRA_PANELS).toEqual(["P21"]);
  });

  it("signale chaque variable obligatoire manquante", () => {
    expect(() => loadConfig({ SITE_CODE: "SITE01" })).toThrow(/MQTT_URL/);
    expect(() => loadConfig({ SITE_CODE: "SITE01" })).toThrow(/MQTT_USERNAME/);
    expect(() => loadConfig({ SITE_CODE: "SITE01" })).toThrow(/MQTT_PASSWORD/);
  });

  it("refuse une URL de broker qui n'est pas mqtt:// ou mqtts://", () => {
    expect(() => loadConfig({ ...validEnv, MQTT_URL: "https://broker.example.com" })).toThrow(
      /MQTT_URL/,
    );
  });

  it("refuse un code de site qui ne respecte pas le format partagé", () => {
    expect(() => loadConfig({ ...validEnv, SITE_CODE: "site-01" })).toThrow(/SITE_CODE/);
  });

  it("refuse un code de panneau invalide dans FAULTY_PANELS", () => {
    expect(() => loadConfig({ ...validEnv, FAULTY_PANELS: "P07,panneau12" })).toThrow(
      /FAULTY_PANELS/,
    );
  });
});
