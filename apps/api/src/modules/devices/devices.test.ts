import {
  DEVICE_SILENCE_TIMEOUT_S,
  MESSAGE_VERSION,
  type DeviceStatusValue,
} from "@solar/contracts";
import type { FastifyBaseLogger } from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { DeviceRow, DevicesRepository, DeviceUpdate } from "./repository";
import { createDevicesService } from "./service";
import { nextDeviceStatus, type DeviceEvent } from "./status";

describe("transitions du statut de l'objet (diagramme 5.2)", () => {
  const cases: [DeviceStatusValue, DeviceEvent, DeviceStatusValue][] = [
    ["unknown", "message", "online"],
    ["unknown", "online", "online"],
    ["online", "offline", "offline"],
    ["online", "silence", "offline"],
    ["offline", "online", "online"],
    ["offline", "message", "online"],
    ["offline", "silence", "offline"],
    ["unknown", "silence", "unknown"],
    // Last Will retained relu au démarrage de l'API : l'objet était hors ligne.
    ["unknown", "offline", "offline"],
  ];
  it.each(cases)("%s + %s → %s", (from, event, to) => {
    expect(nextDeviceStatus(from, event)).toBe(to);
  });
});

const SITE_ID = "00000000-0000-4000-8000-000000000001";

function setup(status: DeviceStatusValue, lastSeenAt: Date | null = null) {
  const device: DeviceRow & { lastSeenAt: Date | null; firmwareVersion?: string } = {
    id: "00000000-0000-4000-8000-000000000002",
    siteId: SITE_ID,
    status,
    lastSeenAt,
  };
  const updates: DeviceUpdate[] = [];
  const repository: DevicesRepository = {
    findBySiteCode: async (code) => (code === "SITE01" ? device : null),
    findBySiteId: async (id) => (id === SITE_ID ? device : null),
    update: async (_id, changes) => {
      updates.push(changes);
      Object.assign(device, changes);
    },
    findSilentOnline: async (before) =>
      device.status === "online" && device.lastSeenAt && device.lastSeenAt < before ? [device] : [],
  };
  const logger = { warn: vi.fn(), info: vi.fn() } as unknown as FastifyBaseLogger;
  const alerts = { deviceOffline: vi.fn(async () => {}), deviceOnline: vi.fn(async () => {}) };
  return {
    service: createDevicesService(repository, logger, alerts),
    device,
    updates,
    alerts,
  };
}

const at = new Date("2026-11-26T10:00:00Z");

describe("suivi du statut de l'objet", () => {
  it("statut online : en ligne, dernière activité et version du firmware", async () => {
    const { service, device } = setup("unknown");
    await service.recordStatus(
      "SITE01",
      { v: MESSAGE_VERSION, status: "online", firmwareVersion: "0.2.0" },
      at,
    );
    expect(device).toMatchObject({ status: "online", lastSeenAt: at, firmwareVersion: "0.2.0" });
  });

  it("Last Will : hors ligne, sans modifier la dernière activité", async () => {
    const before = new Date("2026-11-26T09:59:00Z");
    const { service, device, updates } = setup("online", before);
    await service.recordStatus("SITE01", { v: MESSAGE_VERSION, status: "offline" }, at);
    expect(device.status).toBe("offline");
    expect(device.lastSeenAt).toBe(before);
    expect(updates[0]).not.toHaveProperty("lastSeenAt");
  });

  it("une mesure repasse en ligne un objet hors ligne", async () => {
    const { service, device } = setup("offline");
    await service.recordActivity(SITE_ID, at);
    expect(device).toMatchObject({ status: "online", lastSeenAt: at });
  });

  it("le planificateur passe hors ligne un objet silencieux depuis plus de 60 s", async () => {
    const { service, device } = setup("online", at);
    const justBefore = new Date(at.getTime() + DEVICE_SILENCE_TIMEOUT_S * 1000);
    expect(await service.checkSilence(justBefore)).toHaveLength(0);
    expect(device.status).toBe("online");
    const after = new Date(at.getTime() + (DEVICE_SILENCE_TIMEOUT_S + 1) * 1000);
    expect(await service.checkSilence(after)).toHaveLength(1);
    expect(device.status).toBe("offline");
  });

  it("ignore le statut d'un site inconnu", async () => {
    const { service, updates } = setup("unknown");
    await service.recordStatus("SITE99", { v: MESSAGE_VERSION, status: "online" }, at);
    expect(updates).toHaveLength(0);
  });
});

describe("alertes device_offline (séquence 4.4)", () => {
  it("le Last Will d'un objet en ligne ouvre l'alerte", async () => {
    const { service, alerts } = setup("online", at);
    await service.recordStatus("SITE01", { v: MESSAGE_VERSION, status: "offline" }, at);
    expect(alerts.deviceOffline).toHaveBeenCalledExactlyOnceWith(SITE_ID);
    expect(alerts.deviceOnline).not.toHaveBeenCalled();
  });

  it("un second Last Will ne rouvre pas d'alerte", async () => {
    const { service, alerts } = setup("offline", at);
    await service.recordStatus("SITE01", { v: MESSAGE_VERSION, status: "offline" }, at);
    expect(alerts.deviceOffline).not.toHaveBeenCalled();
  });

  it("le planificateur ouvre l'alerte d'un objet silencieux", async () => {
    const { service, alerts } = setup("online", at);
    await service.checkSilence(new Date(at.getTime() + (DEVICE_SILENCE_TIMEOUT_S + 1) * 1000));
    expect(alerts.deviceOffline).toHaveBeenCalledExactlyOnceWith(SITE_ID);
  });

  it("le statut online d'un objet hors ligne résout l'alerte", async () => {
    const { service, alerts } = setup("offline", at);
    await service.recordStatus("SITE01", { v: MESSAGE_VERSION, status: "online" }, at);
    expect(alerts.deviceOnline).toHaveBeenCalledExactlyOnceWith(SITE_ID, at);
  });

  it("une mesure d'un objet hors ligne résout l'alerte ; pas d'appel pour un objet déjà en ligne", async () => {
    const offline = setup("offline");
    await offline.service.recordActivity(SITE_ID, at);
    expect(offline.alerts.deviceOnline).toHaveBeenCalledExactlyOnceWith(SITE_ID, at);

    const online = setup("online");
    await online.service.recordActivity(SITE_ID, at);
    expect(online.alerts.deviceOnline).not.toHaveBeenCalled();
  });
});
