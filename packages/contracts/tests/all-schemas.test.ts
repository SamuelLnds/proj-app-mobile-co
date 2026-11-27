// Chaque schéma exporté par @solar/contracts a au moins un exemple accepté et un exemple refusé (#52).
// La table est complète par construction : un schéma ajouté sans exemples fait échouer le premier test.
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import * as contracts from "../src/index";

const ID = "00000000-0000-4000-8000-000000000001";
const ID2 = "00000000-0000-4000-8000-000000000002";
const NOW = "2026-11-27T10:00:00.000Z";
const FINGERPRINT = "a".repeat(64);
const SERIAL = "0123456789abcdef0123456789abcdef";

const user = { id: ID, email: "operator@demo.local", name: "Exploitant", role: "operator" };
const latest = {
  timestamp: NOW,
  irradiance: 800,
  production: 3100,
  expectedProduction: 3200,
  temperature: 31.5,
  batteryLevel: 62,
  batteryPower: 900,
  gridPower: 2200,
  mode: "manual",
  simulatedFault: false,
};
const siteSummary = {
  id: ID,
  code: "SITE01",
  name: "Parc de démo",
  latitude: 47.25,
  longitude: -1.55,
  deviceStatus: "online",
  latestMeasurement: latest,
  activeAlertCount: 0,
};
const setpointRecord = {
  id: ID,
  mode: "manual",
  requestedBatteryShare: 70,
  status: "applied",
  appliedBatteryShare: 70,
  rejectionReason: null,
  author: { id: ID2, name: "Exploitant" },
  createdAt: NOW,
  respondedAt: NOW,
};
const controlState = {
  v: 1,
  setpointId: ID,
  mode: "manual",
  status: "applied",
  appliedBatteryShare: 70,
  reason: null,
  timestamp: NOW,
};
const siteDetail = {
  ...siteSummary,
  peakPowerW: 4000,
  batteryCapacityWh: 10000,
  maxChargePowerW: 3000,
  currentSetpoint: setpointRecord,
  controlState,
  deviceLastSeenAt: NOW,
};
const sitePoint = {
  time: NOW,
  irradiance: 800,
  production: 3100,
  temperature: 31,
  batteryLevel: 62,
  batteryPower: 900,
  gridPower: 2200,
};
const alert = {
  id: ID,
  type: "low_production",
  severity: "warning",
  message: "Production basse sur le panneau P07",
  status: "active",
  site: { id: ID, name: "Parc de démo" },
  panel: { id: ID2, name: "Panneau P07" },
  startedAt: NOW,
  endedAt: null,
};
const panelSummary = {
  id: ID,
  code: "P07",
  name: "Panneau P07",
  latitude: 47.25,
  longitude: -1.55,
  placed: true,
  source: "seed",
  status: "normal",
  latestProduction: 150,
  latestTemperature: 40,
};
const panelDetail = {
  ...panelSummary,
  ratedPowerW: 200,
  expectedProduction: 160,
  activeAlerts: [alert],
};
const panelPoint = { time: NOW, production: 150, temperature: 40 };
const enrollment = {
  id: ID,
  deviceName: "device-site01",
  fingerprint: FINGERPRINT,
  status: "active",
  requestedAt: NOW,
  pendingExpiresAt: NOW,
  decidedAt: NOW,
  decidedBy: { id: ID2, name: "Exploitant" },
  serialNumber: SERIAL,
  certificateExpiresAt: NOW,
  revokedAt: null,
};
const statusResponse = {
  fingerprint: FINGERPRINT,
  status: "pending",
  pendingExpiresAt: NOW,
  certificate: null,
  certificateExpiresAt: null,
};
const csr = "-----BEGIN CERTIFICATE REQUEST-----\nMIIB\n-----END CERTIFICATE REQUEST-----\n";

type Examples = { valid: unknown[]; invalid: unknown[] };

/** Exemples par schéma : au moins un accepté, au moins un refusé. */
const EXAMPLES: Record<string, Examples> = {
  // Énumérations
  UserRoleSchema: { valid: ["operator", "viewer"], invalid: ["admin"] },
  MobilePlatformSchema: { valid: ["android", "ios"], invalid: ["windows"] },
  DeviceStatusValueSchema: { valid: ["unknown", "online", "offline"], invalid: ["busy"] },
  PanelSourceSchema: { valid: ["seed", "discovered", "manual"], invalid: ["import"] },
  ControlModeSchema: { valid: ["manual", "automatic", "discharge"], invalid: ["auto"] },
  SetpointStatusSchema: { valid: ["sent", "no_response"], invalid: ["pending"] },
  RejectionReasonSchema: { valid: ["battery_full", "invalid_setpoint"], invalid: ["unknown"] },
  AlertTypeSchema: { valid: ["low_production", "device_offline"], invalid: ["fire"] },
  AlertSeveritySchema: { valid: ["info", "critical"], invalid: ["fatal"] },
  AlertStatusSchema: { valid: ["active", "resolved"], invalid: ["closed"] },
  EnrollmentStatusSchema: { valid: ["pending", "revoked"], invalid: ["accepted"] },
  ErrorCodeSchema: { valid: ["NOT_FOUND", "INVALID_CSR"], invalid: ["BOOM"] },
  PanelStatusSchema: { valid: ["normal", "no_data"], invalid: ["broken"] },
  MeasurementIntervalSchema: { valid: ["1m", "1h"], invalid: ["2m"] },
  ControlResultSchema: { valid: ["applied", "partial", "rejected"], invalid: ["sent"] },

  // Briques
  BatteryShareSchema: { valid: [0, 70, 100], invalid: [75, -10, 110, 70.5] },
  Iso8601UtcSchema: { valid: [NOW, "2026-11-27T10:00:00Z"], invalid: ["2026-11-27", "27/11/2026"] },
  PercentSchema: { valid: [0, 62.5, 100], invalid: [-1, 101] },
  TemperatureSchema: { valid: [-40, 31.5, 125], invalid: [-41, 126] },
  IdSchema: { valid: [ID], invalid: ["1234"] },
  IdParamsSchema: { valid: [{ id: ID }], invalid: [{ id: "x" }, {}] },
  FingerprintSchema: { valid: [FINGERPRINT], invalid: ["A".repeat(64), "a".repeat(63)] },
  DeviceNameSchema: { valid: ["device-site01"], invalid: ["Device Site", "ab"] },
  PageQuerySchema: {
    valid: [{}, { limit: "50", before: NOW }],
    invalid: [{ limit: 0 }, { limit: 101 }],
  },
  MeasurementQuerySchema: {
    valid: [{ from: "2026-11-26T10:00:00.000Z", to: NOW, interval: "15m" }],
    invalid: [
      { from: NOW, to: "2026-11-26T10:00:00.000Z", interval: "15m" },
      { from: "2026-11-01T10:00:00.000Z", to: NOW, interval: "1h" },
    ],
  },
  ErrorDetailSchema: {
    valid: [{ field: "email", message: "Requis" }],
    invalid: [{ field: "email" }],
  },
  ErrorResponseSchema: {
    valid: [{ error: { code: "NOT_FOUND", message: "Introuvable", details: null } }],
    invalid: [{ error: { code: "BOOM", message: "x", details: null } }],
  },

  // Messages MQTT
  SiteMeasurementSchema: {
    valid: [{ v: 1, ...latest, expectedProduction: undefined }],
    invalid: [
      { v: 2, ...latest },
      { v: 1, ...latest, irradiance: 2000 },
    ],
  },
  PanelMeasurementSchema: {
    valid: [{ v: 1, timestamp: NOW, production: 150, temperature: 40 }],
    invalid: [{ v: 1, timestamp: NOW, production: -1, temperature: 40 }],
  },
  SetpointSchema: {
    valid: [{ v: 1, id: ID, mode: "automatic", batteryShare: null, issuedAt: NOW }],
    invalid: [{ v: 1, id: ID, mode: "manual", batteryShare: null, issuedAt: NOW }],
  },
  ControlStateSchema: { valid: [controlState], invalid: [{ ...controlState, status: "sent" }] },
  DeviceStatusSchema: {
    valid: [
      { v: 1, status: "online", firmwareVersion: "0.1.0" },
      { v: 1, status: "offline" },
    ],
    invalid: [{ v: 1, status: "unknown" }],
  },

  // API : authentification et santé
  UserSchema: { valid: [user], invalid: [{ ...user, role: "admin" }] },
  LoginRequestSchema: {
    valid: [{ email: "operator@demo.local", password: "secret" }],
    invalid: [
      { email: "pas-un-email", password: "x" },
      { email: "a@b.fr", password: "" },
    ],
  },
  LoginResponseSchema: {
    valid: [{ token: "jeton", expiresAt: NOW, user }],
    invalid: [{ token: "jeton", expiresAt: "demain", user }],
  },
  RegisterPushTokenRequestSchema: {
    valid: [{ token: "ExponentPushToken[x]", platform: "android" }],
    invalid: [
      { token: "", platform: "android" },
      { token: "x", platform: "web" },
    ],
  },
  PushTokenParamsSchema: { valid: [{ token: "x" }], invalid: [{ token: "" }] },
  HealthResponseSchema: {
    valid: [{ status: "ok", database: "up", broker: "up" }],
    invalid: [{ status: "ok", database: "up" }],
  },

  // API : sites
  LatestMeasurementSchema: { valid: [latest], invalid: [{ ...latest, gridPower: -5 }] },
  SiteSummarySchema: {
    valid: [siteSummary, { ...siteSummary, latestMeasurement: null }],
    invalid: [{ ...siteSummary, latitude: 120 }],
  },
  SiteListSchema: { valid: [[siteSummary], []], invalid: [[{ ...siteSummary, id: "x" }]] },
  SiteDetailSchema: {
    valid: [
      siteDetail,
      { ...siteDetail, currentSetpoint: null, controlState: null, deviceLastSeenAt: null },
    ],
    invalid: [{ ...siteDetail, peakPowerW: 0 }],
  },
  SiteMeasurementPointSchema: {
    valid: [sitePoint],
    invalid: [{ ...sitePoint, batteryLevel: 150 }],
  },
  SiteMeasurementSeriesSchema: {
    valid: [[sitePoint], []],
    invalid: [[{ ...sitePoint, time: "hier" }]],
  },

  // API : panneaux
  PanelSummarySchema: {
    valid: [panelSummary, { ...panelSummary, latitude: null, longitude: null, placed: false }],
    invalid: [{ ...panelSummary, status: "broken" }],
  },
  PanelListSchema: {
    valid: [[panelSummary], []],
    invalid: [[{ ...panelSummary, latestProduction: -1 }]],
  },
  PanelDetailSchema: { valid: [panelDetail], invalid: [{ ...panelDetail, ratedPowerW: -200 }] },
  UpdatePanelRequestSchema: {
    valid: [{ name: "Panneau 7" }, { latitude: 47.25, longitude: -1.55 }],
    invalid: [{}, { latitude: 47.25 }],
  },
  PanelMeasurementPointSchema: {
    valid: [panelPoint],
    invalid: [{ ...panelPoint, temperature: 200 }],
  },
  PanelMeasurementSeriesSchema: {
    valid: [[panelPoint]],
    invalid: [[{ ...panelPoint, production: -3 }]],
  },

  // API : consignes
  CreateSetpointRequestSchema: {
    valid: [{ mode: "manual", batteryShare: 70 }, { mode: "discharge" }],
    invalid: [{ mode: "manual" }, { mode: "automatic", batteryShare: 50 }],
  },
  SetpointRecordSchema: {
    valid: [setpointRecord],
    invalid: [{ ...setpointRecord, status: "done" }],
  },
  SetpointPageSchema: {
    valid: [
      { items: [setpointRecord], next: null },
      { items: [], next: NOW },
    ],
    invalid: [{ items: [setpointRecord] }],
  },

  // API : alertes
  AlertSchema: { valid: [alert, { ...alert, panel: null }], invalid: [{ ...alert, message: "" }] },
  AlertPageSchema: {
    valid: [{ items: [alert], next: null }],
    invalid: [{ items: [{ ...alert, severity: "x" }], next: null }],
  },
  AlertsQuerySchema: {
    valid: [{ status: "active" }, { siteId: ID, limit: "10" }],
    invalid: [{ status: "closed" }, { siteId: "x" }],
  },

  // API : flux d'événements (bonus #60)
  StreamTopicSchema: { valid: ["site", "enrollments"], invalid: ["measurements"] },
  StreamEventSchema: {
    valid: [
      { v: 1, topic: "site", siteCode: "SITE01", at: NOW },
      { v: 1, topic: "alerts", siteCode: null, at: NOW },
    ],
    invalid: [
      { v: 2, topic: "site", siteCode: null, at: NOW },
      { v: 1, topic: "x", siteCode: null, at: NOW },
    ],
  },

  // API : enrôlement des objets
  EnrollmentRequestSchema: {
    valid: [{ deviceName: "device-site01", csr }],
    invalid: [{ deviceName: "device-site01", csr: "pas un CSR" }],
  },
  FingerprintParamsSchema: {
    valid: [{ fingerprint: FINGERPRINT }],
    invalid: [{ fingerprint: "abc" }],
  },
  EnrollmentStatusResponseSchema: {
    valid: [
      statusResponse,
      {
        ...statusResponse,
        status: "active",
        certificate: "-----BEGIN CERTIFICATE-----",
        certificateExpiresAt: NOW,
      },
    ],
    invalid: [{ ...statusResponse, status: "accepted" }],
  },
  EnrollmentSchema: { valid: [enrollment], invalid: [{ ...enrollment, serialNumber: "12" }] },
  EnrollmentsQuerySchema: {
    valid: [{}, { status: "pending", limit: "5" }],
    invalid: [{ status: "accepted" }],
  },
  EnrollmentPageSchema: {
    valid: [{ items: [enrollment], next: null }],
    invalid: [{ items: [enrollment], next: "x" }],
  },
  AcceptEnrollmentRequestSchema: {
    valid: [{}, { ttlHours: 168 }],
    invalid: [{ ttlHours: 169 }, { ttlHours: 0 }],
  },
};

const exportedSchemas = Object.entries(contracts).filter(
  ([name, value]) =>
    name.endsWith("Schema") && typeof (value as z.ZodType)?.safeParse === "function",
);

describe("tous les schémas de @solar/contracts", () => {
  it("ont des exemples acceptés et refusés (table complète)", () => {
    const missing = exportedSchemas.map(([name]) => name).filter((name) => !EXAMPLES[name]);
    expect(missing).toEqual([]);
    const unknown = Object.keys(EXAMPLES).filter((name) => !(name in contracts));
    expect(unknown).toEqual([]);
  });

  for (const [name, schema] of exportedSchemas) {
    const examples = EXAMPLES[name];
    if (!examples) continue;
    it(`${name} accepte ses exemples valides et refuse les autres`, () => {
      expect(examples.valid.length).toBeGreaterThan(0);
      expect(examples.invalid.length).toBeGreaterThan(0);
      for (const value of examples.valid) {
        const result = (schema as z.ZodType).safeParse(value);
        expect(result.success, `${name} devrait accepter ${JSON.stringify(value)}`).toBe(true);
      }
      for (const value of examples.invalid) {
        const result = (schema as z.ZodType).safeParse(value);
        expect(result.success, `${name} devrait refuser ${JSON.stringify(value)}`).toBe(false);
      }
    });
  }

  it("pageSchema construit une page qui refuse un élément invalide", () => {
    const page = contracts.pageSchema(contracts.IdSchema);
    expect(page.safeParse({ items: [ID], next: null }).success).toBe(true);
    expect(page.safeParse({ items: ["x"], next: null }).success).toBe(false);
  });
});
