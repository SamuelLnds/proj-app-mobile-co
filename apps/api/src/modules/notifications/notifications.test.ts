// Notification des alertes par ntfy : aucun appel réseau, la fonction d'envoi et `fetch` sont simulés.
import { describe, expect, it, vi } from "vitest";
import { loadConfig, ntfySettings } from "../../config";
import type { AlertRow } from "../alerts/repository";
import { createNtfySender, type NtfyMessage, type NtfySender } from "./ntfy-client";
import { alertNotification, createNotificationsService } from "./service";

const NOW = new Date("2026-11-26T10:00:00Z");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

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

function setup() {
  const send = vi.fn<NtfySender>(async () => undefined);
  return { send, service: createNotificationsService(send) };
}

describe("message d'une alerte", () => {
  it("critical : titre « Alerte critique », priorité urgent, lien vers l'écran Alertes", async () => {
    const t = setup();
    expect(await t.service.notifyAlert(alert())).toBe(true);
    expect(t.send).toHaveBeenCalledOnce();
    expect(t.send.mock.calls[0]?.[0]).toEqual({
      title: "Alerte critique",
      body: "L'objet du site Parc de démo est hors ligne",
      priority: "urgent",
      tags: ["rotating_light", "device_offline"],
      click: "solar://alerts",
    });
  });

  it("warning : titre « Alerte », priorité high", async () => {
    const t = setup();
    await t.service.notifyAlert(alert({ severity: "warning", type: "battery_low" }));
    expect(t.send.mock.calls[0]?.[0]).toMatchObject({
      title: "Alerte",
      priority: "high",
      tags: ["warning", "battery_low"],
    });
  });

  it("alerte d'un panneau : le lien ouvre le détail du panneau", () => {
    const message = alertNotification(alert({ panelId: id(107), type: "overheating" }));
    expect(message.click).toBe(`solar://panel/${id(107)}`);
  });

  it("info : aucun envoi", async () => {
    const t = setup();
    expect(await t.service.notifyAlert(alert({ severity: "info" }))).toBe(false);
    expect(t.send).not.toHaveBeenCalled();
  });

  it("envoi désactivé : rien n'est envoyé et aucune erreur", async () => {
    const service = createNotificationsService(null);
    expect(service.enabled).toBe(false);
    expect(await service.notifyAlert(alert())).toBe(false);
  });

  it("une erreur d'envoi remonte au moteur d'alertes, qui la journalise", async () => {
    const send = vi.fn<NtfySender>().mockRejectedValue(new Error("ntfy injoignable"));
    await expect(createNotificationsService(send).notifyAlert(alert())).rejects.toThrow(
      "ntfy injoignable",
    );
  });

  it("ne contient aucune donnée personnelle : ni e-mail ni nom d'utilisateur", async () => {
    const t = setup();
    await t.service.notifyAlert(alert({ panelId: id(107), type: "overheating" }));
    const message = t.send.mock.calls[0]?.[0] as NtfyMessage;
    const content = JSON.stringify(message);
    for (const personal of ["operator@demo.local", "viewer@demo.local", "Exploitant", "Lecteur"]) {
      expect(content).not.toContain(personal);
    }
    // Seuls le texte de l'alerte, des étiquettes techniques et un lien sont transmis.
    expect(Object.keys(message).sort()).toEqual(["body", "click", "priority", "tags", "title"]);
  });
});

describe("publication sur le serveur ntfy", () => {
  const message: NtfyMessage = {
    title: "Alerte critique",
    body: "L'objet du site Parc de démo est hors ligne",
    priority: "urgent",
    tags: ["rotating_light", "device_offline"],
    click: "solar://alerts",
  };
  const options = {
    url: "http://127.0.0.1:8090/",
    topic: "solar-site01-alerts",
    token: "tk_secret",
  };

  it("POST sur URL/sujet avec le jeton, le titre, la priorité, les étiquettes et le lien", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
    await createNtfySender(options, fetchFn as unknown as typeof fetch)(message);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8090/solar-site01-alerts");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("L'objet du site Parc de démo est hors ligne");
    expect(init.headers).toEqual({
      Authorization: "Bearer tk_secret",
      Title: "Alerte critique",
      Priority: "urgent",
      Tags: "rotating_light,device_offline",
      Click: "solar://alerts",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("une réponse refusée (401, 403, 500) lève une erreur sans le jeton", async () => {
    const fetchFn = vi.fn(async () => new Response("interdit", { status: 403 }));
    const send = createNtfySender(options, fetchFn as unknown as typeof fetch);
    const error = await send(message).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("403");
    expect((error as Error).message).not.toContain("tk_secret");
  });

  it("une erreur réseau remonte telle quelle", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      createNtfySender(options, fetchFn as unknown as typeof fetch)(message),
    ).rejects.toThrow("fetch failed");
  });
});

describe("configuration de ntfy", () => {
  const base = {
    DATABASE_URL: "postgres://x",
    JWT_SECRET: "x".repeat(32),
    MQTT_URL: "mqtt://127.0.0.1:1883",
    MQTT_USERNAME: "api",
    MQTT_PASSWORD: "x",
  };

  it("sans NTFY_URL (ou vide) : envoi désactivé", () => {
    expect(ntfySettings(loadConfig(base))).toBeNull();
    expect(ntfySettings(loadConfig({ ...base, NTFY_URL: "", NTFY_TOKEN: "" }))).toBeNull();
  });

  it("avec les trois variables : réglages complets", () => {
    const config = loadConfig({
      ...base,
      NTFY_URL: "http://127.0.0.1:8090",
      NTFY_TOPIC: "solar-site01-alerts",
      NTFY_TOKEN: "tk_secret",
    });
    expect(ntfySettings(config)).toEqual({
      url: "http://127.0.0.1:8090",
      topic: "solar-site01-alerts",
      token: "tk_secret",
    });
  });

  it("NTFY_URL sans sujet ni jeton : démarrage refusé, message explicite", () => {
    expect(() => loadConfig({ ...base, NTFY_URL: "http://127.0.0.1:8090" })).toThrow(
      /NTFY_TOPIC[\s\S]*NTFY_TOKEN/,
    );
  });
});
