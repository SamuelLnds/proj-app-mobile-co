import { describe, expect, it } from "vitest";
import {
  AlertsQuerySchema,
  CreateSetpointRequestSchema,
  ERROR_HTTP_STATUS,
  ErrorCodeSchema,
  ErrorResponseSchema,
  MeasurementQuerySchema,
  PageQuerySchema,
  PanelDetailSchema,
  ROUTES,
  SetpointRecordSchema,
  UpdatePanelRequestSchema,
} from "../src/index";

describe("consigne (POST /v1/sites/{id}/setpoints)", () => {
  const parse = (body: unknown) => CreateSetpointRequestSchema.safeParse(body).success;

  it("refuse batteryShare absente en mode manual", () => {
    expect(parse({ mode: "manual" })).toBe(false);
    expect(parse({ mode: "manual", batteryShare: null })).toBe(false);
  });

  it("accepte batteryShare en mode manual", () => {
    expect(parse({ mode: "manual", batteryShare: 70 })).toBe(true);
    expect(parse({ mode: "manual", batteryShare: 0 })).toBe(true);
    expect(parse({ mode: "manual", batteryShare: 100 })).toBe(true);
  });

  it("refuse batteryShare présente dans les autres modes", () => {
    expect(parse({ mode: "automatic", batteryShare: 50 })).toBe(false);
    expect(parse({ mode: "discharge", batteryShare: 0 })).toBe(false);
  });

  it("accepte l'absence de batteryShare dans les autres modes", () => {
    expect(parse({ mode: "automatic" })).toBe(true);
    expect(parse({ mode: "discharge", batteryShare: null })).toBe(true);
  });

  it("refuse un batteryShare non multiple de 10 ou hors bornes", () => {
    for (const batteryShare of [5, 55, 101, 110, -10, 12.5]) {
      expect(parse({ mode: "manual", batteryShare })).toBe(false);
    }
  });
});

describe("mise à jour d'un panneau (PATCH /v1/panels/{id})", () => {
  const parse = (body: unknown) => UpdatePanelRequestSchema.safeParse(body).success;

  it("accepte un champ seul ou une position complète", () => {
    expect(parse({ name: "Rangée A, panneau 7" })).toBe(true);
    expect(parse({ ratedPowerW: 250 })).toBe(true);
    expect(parse({ latitude: 47.25, longitude: -1.55 })).toBe(true);
  });

  it("exige latitude et longitude ensemble", () => {
    expect(parse({ latitude: 47.25 })).toBe(false);
    expect(parse({ longitude: -1.55 })).toBe(false);
  });

  it("refuse un corps vide et des valeurs invalides", () => {
    expect(parse({})).toBe(false);
    expect(parse({ name: "" })).toBe(false);
    expect(parse({ ratedPowerW: 0 })).toBe(false);
    expect(parse({ latitude: 91, longitude: 0 })).toBe(false);
    expect(parse({ latitude: 0, longitude: 181 })).toBe(false);
  });
});

describe("pagination et courbes", () => {
  it("applique les valeurs par défaut et les bornes de limit", () => {
    expect(PageQuerySchema.parse({}).limit).toBe(20);
    expect(PageQuerySchema.parse({ limit: "100" }).limit).toBe(100);
    expect(PageQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(PageQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
  });

  it("valide les paramètres de alerts", () => {
    expect(AlertsQuerySchema.safeParse({ status: "active" }).success).toBe(true);
    expect(AlertsQuerySchema.safeParse({ status: "closed" }).success).toBe(false);
  });

  it("limite l'écart des courbes à 7 jours et l'intervalle aux valeurs prévues", () => {
    const base = { from: "2026-11-01T00:00:00Z", to: "2026-11-08T00:00:00Z", interval: "1h" };
    expect(MeasurementQuerySchema.safeParse(base).success).toBe(true);
    expect(MeasurementQuerySchema.safeParse({ ...base, to: "2026-11-08T00:00:01Z" }).success).toBe(
      false,
    );
    expect(MeasurementQuerySchema.safeParse({ ...base, to: "2026-10-31T00:00:00Z" }).success).toBe(
      false,
    );
    expect(MeasurementQuerySchema.safeParse({ ...base, interval: "2m" }).success).toBe(false);
  });
});

describe("objets renvoyés", () => {
  it("accepte une consigne en vigueur", () => {
    const record = {
      id: "0b8f3c1e-5d1a-4a53-9a0e-2f4b7c9d1e22",
      mode: "manual",
      requestedBatteryShare: 70,
      status: "partial",
      appliedBatteryShare: 55,
      rejectionReason: "charge_limit",
      author: { id: "7d9f0a6c-3f6e-4f3b-8d52-1a2b3c4d5e6f", name: "Alice" },
      createdAt: "2026-11-20T10:16:00Z",
      respondedAt: "2026-11-20T10:16:01Z",
    };
    expect(SetpointRecordSchema.safeParse(record).success).toBe(true);
  });

  it("accepte un panneau non positionné", () => {
    const panel = {
      id: "0b8f3c1e-5d1a-4a53-9a0e-2f4b7c9d1e22",
      code: "P07",
      name: "P07",
      latitude: null,
      longitude: null,
      placed: false,
      source: "discovered",
      status: "no_data",
      latestProduction: null,
      latestTemperature: null,
      ratedPowerW: 200,
      expectedProduction: null,
      activeAlerts: [],
    };
    expect(PanelDetailSchema.safeParse(panel).success).toBe(true);
  });
});

describe("erreurs", () => {
  it("accepte l'exemple de la section 7.1", () => {
    const example = {
      error: {
        code: "DEVICE_OFFLINE",
        message: "L'objet du site est hors ligne, la consigne ne peut pas être envoyée.",
        details: null,
      },
    };
    expect(ErrorResponseSchema.safeParse(example).success).toBe(true);
  });

  it("refuse un code inconnu", () => {
    const unknown = { error: { code: "BOOM", message: "x", details: null } };
    expect(ErrorResponseSchema.safeParse(unknown).success).toBe(false);
  });

  it("associe chaque code à son code HTTP", () => {
    expect(ErrorCodeSchema.options).toHaveLength(8);
    expect(ERROR_HTTP_STATUS).toEqual({
      UNAUTHENTICATED: 401,
      INVALID_CREDENTIALS: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      DEVICE_OFFLINE: 409,
      INVALID_REQUEST: 422,
      TOO_MANY_ATTEMPTS: 429,
      INTERNAL_ERROR: 500,
    });
  });
});

describe("table des routes (section 7.2)", () => {
  it("couvre les 16 routes avec méthode, chemin et rôle", () => {
    const summary = Object.values(ROUTES).map((r) => `${r.method} ${r.path} ${r.role}`);
    expect(summary).toEqual([
      "GET /v1/health none",
      "POST /v1/auth/login none",
      "GET /v1/auth/me viewer",
      "POST /v1/push-tokens viewer",
      "DELETE /v1/push-tokens/{token} viewer",
      "GET /v1/sites viewer",
      "GET /v1/sites/{id} viewer",
      "GET /v1/sites/{id}/measurements viewer",
      "GET /v1/sites/{id}/panels viewer",
      "GET /v1/panels/{id} viewer",
      "PATCH /v1/panels/{id} operator",
      "DELETE /v1/panels/{id} operator",
      "GET /v1/panels/{id}/measurements viewer",
      "POST /v1/sites/{id}/setpoints operator",
      "GET /v1/sites/{id}/setpoints viewer",
      "GET /v1/alerts viewer",
    ]);
  });

  it("donne un schéma de réponse à tout sauf aux 204", () => {
    for (const route of Object.values(ROUTES)) {
      expect(route.response === null).toBe(route.status === 204);
    }
  });
});
