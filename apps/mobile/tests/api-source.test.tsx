import { SiteDetailSchema, type LoginResponse, type SiteDetail } from "@solar/contracts";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { QueryProvider, useSite } from "../src/api";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import { ApiDataSource, DataSourceError } from "../src/data";
import { createMemoryStore, setResponseStore } from "../src/storage";

const BASE_URL = "http://localhost:3000/v1";
const SITE_ID = "00000000-0000-4000-8000-000000000001";
const TOKEN = "jeton.jwt.de-test";

const SITE: SiteDetail = SiteDetailSchema.parse({
  id: SITE_ID,
  code: "SITE01",
  name: "Parc solaire de démonstration",
  latitude: 47.25,
  longitude: -1.55,
  deviceStatus: "online",
  latestMeasurement: {
    timestamp: "2026-11-23T10:00:00.000Z",
    irradiance: 800,
    production: 3100,
    expectedProduction: 3200,
    temperature: 31.5,
    batteryLevel: 62,
    batteryPower: 900,
    gridPower: 2200,
    mode: "manual",
    simulatedFault: false,
  },
  activeAlertCount: 0,
  peakPowerW: 4000,
  batteryCapacityWh: 10000,
  maxChargePowerW: 3000,
  currentSetpoint: null,
  controlState: null,
  deviceLastSeenAt: "2026-11-23T10:00:01.000Z",
});

const LOGIN: LoginResponse = {
  token: TOKEN,
  expiresAt: "2099-01-01T00:00:00.000Z",
  user: { id: SITE_ID, email: "operator@demo.local", name: "Exploitant", role: "operator" },
};

function json(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** Faux serveur : répond aux routes utilisées, ou échoue comme un réseau coupé. */
function fakeServer() {
  const state = { online: true };
  const fetchFn = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (!state.online) return Promise.reject(new TypeError("Network request failed"));
    const url = String(input);
    if (url.endsWith("/auth/login")) return json(200, LOGIN);
    if (url.endsWith(`/sites/${SITE_ID}`)) {
      const auth = new Headers(init?.headers).get("Authorization");
      return auth === `Bearer ${TOKEN}`
        ? json(200, SITE)
        : json(401, {
            error: { code: "UNAUTHENTICATED", message: "Session expirée.", details: null },
          });
    }
    return json(404, { error: { code: "NOT_FOUND", message: "Introuvable.", details: null } });
  });
  return { state, fetchFn };
}

describe("ApiDataSource", () => {
  it("joint le jeton et valide la réponse par son schéma", async () => {
    const { fetchFn } = fakeServer();
    const source = new ApiDataSource(BASE_URL, fetchFn);
    source.setToken(TOKEN);
    await expect(source.getSite(SITE_ID)).resolves.toEqual(SITE);
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(`${BASE_URL}/sites/${SITE_ID}`);
  });

  it("convertit une erreur de l'API et signale une session expirée", async () => {
    const { fetchFn } = fakeServer();
    const source = new ApiDataSource(BASE_URL, fetchFn);
    const onUnauthorized = jest.fn();
    source.onUnauthorized(onUnauthorized);
    await expect(source.getSite(SITE_ID)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Session expirée.",
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("renvoie NETWORK_ERROR quand le serveur est injoignable", async () => {
    const { state, fetchFn } = fakeServer();
    state.online = false;
    const error = await new ApiDataSource(BASE_URL, fetchFn).listSites().catch((e) => e);
    expect(error).toBeInstanceOf(DataSourceError);
    expect(error.code).toBe("NETWORK_ERROR");
  });
});

// La source active de l'app devient une source api ; ses appels passent par `fetch`,
// remplacé ci-dessous par le faux serveur.
jest.mock("../src/data", () => {
  const actual = jest.requireActual("../src/data");
  return { ...actual, dataSource: new actual.ApiDataSource("http://localhost:3000/v1") };
});

describe("source api, stockage local et session", () => {
  const server = fakeServer();
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = server.fetchFn as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );

  it("useSite renvoie les données de l'API, les enregistre, et les relit sans réseau", async () => {
    const store = createMemoryStore();
    setResponseStore(store);
    server.state.online = true;

    const first = await renderHook(() => ({ auth: useAuth(), site: useSite(SITE_ID) }), {
      wrapper,
    });
    // La session enregistrée est relue avant le premier affichage.
    await waitFor(() => expect(first.result.current).not.toBeNull());
    await act(() =>
      first.result.current.auth.login({ email: "operator@demo.local", password: "x" }),
    );
    await waitFor(() => expect(first.result.current.site.data).toEqual(SITE));
    expect(store.rows.size).toBeGreaterThan(0);
    await first.unmount();

    // Redémarrage de l'app sans réseau : la dernière valeur enregistrée est affichée.
    server.state.online = false;
    const second = await renderHook(() => useSite(SITE_ID), { wrapper });
    await waitFor(() => expect(second.result.current.data).toEqual(SITE));
    await second.unmount();
  });

  it("n'écrit jamais le jeton dans SQLite, seulement dans expo-secure-store", async () => {
    const store = createMemoryStore();
    setResponseStore(store);
    server.state.online = true;

    const hook = await renderHook(() => ({ auth: useAuth(), site: useSite(SITE_ID) }), {
      wrapper,
    });
    // La session enregistrée est relue avant le premier affichage.
    await waitFor(() => expect(hook.result.current).not.toBeNull());
    await act(() =>
      hook.result.current.auth.login({ email: "operator@demo.local", password: "x" }),
    );
    await waitFor(() => expect(hook.result.current.site.data).toEqual(SITE));

    for (const body of store.rows.values()) expect(body).not.toContain(TOKEN);
    const secureStore = jest.requireMock("expo-secure-store") as { __items: Map<string, string> };
    expect([...secureStore.__items.values()].join()).toContain(TOKEN);
    await hook.unmount();
  });
});
