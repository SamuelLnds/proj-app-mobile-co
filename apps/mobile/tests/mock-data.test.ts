import {
  AlertPageSchema,
  PanelDetailSchema,
  PanelListSchema,
  PanelMeasurementSeriesSchema,
  SetpointPageSchema,
  SetpointRecordSchema,
  SiteDetailSchema,
  SiteListSchema,
  SiteMeasurementSeriesSchema,
} from "@solar/contracts";

import { MockDataSource } from "../src/data";
import { applyControl } from "../src/data/mock/control";
import { SITE } from "../src/data/mock/fixtures";

const base = Date.parse("2026-11-20T10:00:00Z");

function source(scenario: ConstructorParameters<typeof MockDataSource>[0] = "normal") {
  let now = base;
  const mock = new MockDataSource(scenario, () => now, 0);
  return { mock, advance: (ms: number) => (now += ms) };
}

const range = {
  from: new Date(base - 3_600_000).toISOString(),
  to: new Date(base).toISOString(),
  interval: "5m" as const,
};

describe("source de données mock", () => {
  it("renvoie des objets conformes aux schémas de l'API", async () => {
    const { mock } = source();
    await mock.login({ email: "operator@demo.local", password: "demo" });
    expect(SiteListSchema.safeParse(await mock.listSites()).success).toBe(true);
    expect(SiteDetailSchema.safeParse(await mock.getSite(SITE.id)).success).toBe(true);
    expect(
      SiteMeasurementSeriesSchema.safeParse(await mock.getSiteMeasurements(SITE.id, range)).success,
    ).toBe(true);
    const panels = await mock.listPanels(SITE.id);
    expect(PanelListSchema.safeParse(panels).success).toBe(true);
    expect(PanelDetailSchema.safeParse(await mock.getPanel(panels[6]!.id)).success).toBe(true);
    expect(
      PanelMeasurementSeriesSchema.safeParse(await mock.getPanelMeasurements(panels[6]!.id, range))
        .success,
    ).toBe(true);
    expect(SetpointPageSchema.safeParse(await mock.listSetpoints(SITE.id)).success).toBe(true);
    expect(AlertPageSchema.safeParse(await mock.listAlerts()).success).toBe(true);
  });

  it("refuse un mauvais mot de passe", async () => {
    const { mock } = source();
    await expect(mock.login({ email: "operator@demo.local", password: "x" })).rejects.toMatchObject(
      {
        code: "INVALID_CREDENTIALS",
      },
    );
  });

  it("réserve les consignes à l'exploitant", async () => {
    const { mock } = source();
    await mock.login({ email: "viewer@demo.local", password: "demo" });
    await expect(mock.createSetpoint(SITE.id, { mode: "automatic" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("applique une consigne après la réponse simulée de l'objet", async () => {
    const { mock, advance } = source();
    await mock.login({ email: "operator@demo.local", password: "demo" });
    const sent = await mock.createSetpoint(SITE.id, { mode: "manual", batteryShare: 30 });
    expect(SetpointRecordSchema.parse(sent).status).toBe("sent");
    advance(2000);
    const site = await mock.getSite(SITE.id);
    expect(site.currentSetpoint?.status).toBe("applied");
    expect(site.latestMeasurement?.mode).toBe("manual");
  });

  it("refuse la charge quand la batterie est pleine", async () => {
    const { mock, advance } = source("battery_full");
    await mock.login({ email: "operator@demo.local", password: "demo" });
    await mock.createSetpoint(SITE.id, { mode: "manual", batteryShare: 70 });
    advance(2000);
    const site = await mock.getSite(SITE.id);
    expect(site.currentSetpoint).toMatchObject({
      status: "rejected",
      rejectionReason: "battery_full",
    });
  });

  it("refuse une consigne quand l'objet est hors ligne", async () => {
    const { mock } = source("device_offline");
    await mock.login({ email: "operator@demo.local", password: "demo" });
    await expect(mock.createSetpoint(SITE.id, { mode: "automatic" })).rejects.toMatchObject({
      code: "DEVICE_OFFLINE",
    });
  });

  it("place un panneau détecté", async () => {
    const { mock } = source();
    await mock.login({ email: "operator@demo.local", password: "demo" });
    const p21 = (await mock.listPanels(SITE.id)).find((p) => p.code === "P21")!;
    expect(p21.placed).toBe(false);
    const placed = await mock.updatePanel(p21.id, { latitude: 47.25, longitude: -1.55 });
    expect(placed.placed).toBe(true);
  });
});

describe("algorithme de pilotage (tableau de la section 7 de l'UML)", () => {
  const base = { production: 3150, level: 60, maxChargePowerW: 3000 };

  it("applique une demande manuelle complète", () => {
    expect(applyControl({ ...base, mode: "manual", requestedShare: 70 })).toMatchObject({
      status: "applied",
      appliedShare: 70,
    });
  });

  it("réduit la part au-delà de la puissance de charge maximale", () => {
    expect(applyControl({ ...base, mode: "manual", requestedShare: 100 })).toMatchObject({
      status: "partial",
      reason: "charge_limit",
      appliedShare: 95,
    });
  });

  it("refuse la charge batterie pleine", () => {
    expect(applyControl({ ...base, level: 96, mode: "manual", requestedShare: 50 })).toMatchObject({
      status: "rejected",
      reason: "battery_full",
      appliedShare: 0,
    });
  });

  it("refuse la restitution batterie faible", () => {
    expect(
      applyControl({ ...base, level: 20, mode: "discharge", requestedShare: null }),
    ).toMatchObject({
      status: "rejected",
      reason: "battery_low",
    });
  });

  it("restitue au-dessus de 20 %", () => {
    expect(applyControl({ ...base, mode: "discharge", requestedShare: null })).toMatchObject({
      status: "applied",
      batteryPower: -3000,
    });
  });

  it("refuse une consigne invalide", () => {
    expect(applyControl({ ...base, mode: "manual", requestedShare: null })).toMatchObject({
      status: "rejected",
      reason: "invalid_setpoint",
    });
  });
});
