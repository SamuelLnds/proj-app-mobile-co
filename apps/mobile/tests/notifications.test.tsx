import type { LoginResponse } from "@solar/contracts";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { QueryProvider } from "../src/api";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import { createMemoryStore, readResponse, saveResponse, setResponseStore } from "../src/storage";
import {
  loadNotifications,
  nativeModules,
  notificationTarget,
  requestNotificationPermission,
} from "../src/notifications/local";
import { NOTIFIED_KEY } from "../src/notifications/alert-notifications";

const JWT = "jeton.jwt.de-test";

const LOGIN: LoginResponse = {
  token: JWT,
  expiresAt: "2099-01-01T00:00:00.000Z",
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "operator@demo.local",
    name: "Exploitant",
    role: "operator",
  },
};

// La source active devient une source api, dont les appels passent par le faux serveur.
jest.mock("../src/data", () => {
  const actual = jest.requireActual("../src/data");
  return { ...actual, dataSource: new actual.ApiDataSource("http://localhost:3000/v1") };
});

const notifications = () => jest.requireMock("expo-notifications");

describe("requestNotificationPermission", () => {
  beforeEach(() => {
    notifications().getPermissionsAsync.mockResolvedValue({ status: "granted" });
    notifications().requestPermissionsAsync.mockClear();
  });

  it("renvoie true quand l'autorisation est déjà accordée, sans la redemander", async () => {
    await expect(requestNotificationPermission()).resolves.toBe(true);
    expect(notifications().requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("demande l'autorisation si elle n'est pas encore accordée", async () => {
    notifications().getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    await expect(requestNotificationPermission()).resolves.toBe(true);
    expect(notifications().requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it("renvoie false quand l'autorisation est refusée", async () => {
    notifications().getPermissionsAsync.mockResolvedValue({ status: "denied" });
    notifications().requestPermissionsAsync.mockResolvedValueOnce({ status: "denied" });
    await expect(requestNotificationPermission()).resolves.toBe(false);
  });

  it("renvoie false, sans erreur, quand la demande échoue", async () => {
    notifications().getPermissionsAsync.mockRejectedValueOnce(new Error("système"));
    await expect(requestNotificationPermission()).resolves.toBe(false);
  });

  it("désactive les notifications sans erreur quand le module natif est absent", async () => {
    // Version de l'app installée avant l'ajout du module : son chargement échoue.
    nativeModules.notifications = () =>
      Promise.reject(new Error("Cannot find native module 'ExpoPushTokenManager'"));
    notifications().getPermissionsAsync.mockClear();
    await expect(loadNotifications()).resolves.toBeNull();
    await expect(requestNotificationPermission()).resolves.toBe(false);
    expect(notifications().getPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe("notificationTarget", () => {
  it("ouvre le détail du panneau quand la notification en désigne un", () => {
    expect(notificationTarget({ panelId: "abc", alertId: "x" })).toBe("/panel/abc");
  });

  it("ouvre l'écran Alertes sinon, quelles que soient les données reçues", () => {
    expect(notificationTarget({ panelId: null })).toBe("/alerts");
    expect(notificationTarget({})).toBe("/alerts");
    expect(notificationTarget(undefined)).toBe("/alerts");
    expect(notificationTarget("texte")).toBe("/alerts");
    expect(notificationTarget({ panelId: 12 })).toBe("/alerts");
  });
});

describe("session et notifications locales", () => {
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      return new Response(JSON.stringify(LOGIN), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });
  beforeEach(() => {
    calls.length = 0;
    notifications().getPermissionsAsync.mockResolvedValue({ status: "granted" });
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );

  async function signIn() {
    const hook = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(hook.result.current).not.toBeNull());
    await act(() => hook.result.current.login({ email: "operator@demo.local", password: "x" }));
    return hook;
  }

  it("demande l'autorisation après la connexion, sans aucun appel de jeton à l'API", async () => {
    notifications().getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    notifications().requestPermissionsAsync.mockClear();
    const hook = await signIn();
    await waitFor(() => expect(notifications().requestPermissionsAsync).toHaveBeenCalled());
    await act(async () => hook.result.current.logout());
    await waitFor(() => expect(hook.result.current.user).toBeNull());
    // Seule la connexion passe par l'API : ni enregistrement ni suppression de jeton.
    expect(calls).toEqual(["POST http://localhost:3000/v1/auth/login"]);
    await hook.unmount();
  });

  it("la connexion réussit même si l'autorisation est refusée", async () => {
    notifications().getPermissionsAsync.mockResolvedValue({ status: "denied" });
    notifications().requestPermissionsAsync.mockResolvedValueOnce({ status: "denied" });
    const hook = await signIn();
    await waitFor(() => expect(hook.result.current.user).not.toBeNull());
    await hook.unmount();
  });

  it("la déconnexion efface les alertes déjà notifiées (pas de rafale à la reconnexion)", async () => {
    const store = createMemoryStore();
    setResponseStore(store);
    await saveResponse(NOTIFIED_KEY, ["a1"]);
    const hook = await signIn();
    await act(async () => hook.result.current.logout());
    await waitFor(() => expect(hook.result.current.user).toBeNull());
    await waitFor(async () => expect(await readResponse(NOTIFIED_KEY)).toBeNull());
    await hook.unmount();
  });
});
