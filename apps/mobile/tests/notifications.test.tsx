import type { LoginResponse } from "@solar/contracts";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { QueryProvider } from "../src/api";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import type { DataSource } from "../src/data";
import { MockDataSource } from "../src/data/mock/MockDataSource";
import {
  loadNotifications,
  nativeModules,
  notificationTarget,
  requestNotificationPermission,
} from "../src/notifications/local";
import { registerForPush } from "../src/notifications/push";

const JWT = "jeton.jwt.de-test";
const BASE_URL = "http://localhost:3000/v1";
const PUSH_TOKEN = "ExponentPushToken[jeton-de-test]";

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

// Le projet EAS vient de app.config.ts, absent de l'environnement de test.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: "projet-eas-de-test" } } } },
}));

// La source active devient une source api, dont les appels passent par le faux serveur.
jest.mock("../src/data", () => {
  const actual = jest.requireActual("../src/data");
  return { ...actual, dataSource: new actual.ApiDataSource("http://localhost:3000/v1") };
});

const notifications = () => jest.requireMock("expo-notifications");
const device = () => jest.requireMock("expo-device");

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

describe("registerForPush", () => {
  beforeEach(() => {
    device().isDevice = true;
    notifications().getPermissionsAsync.mockResolvedValue({ status: "granted" });
    notifications().requestPermissionsAsync.mockClear();
    notifications().getExpoPushTokenAsync.mockClear();
  });

  it("renvoie le jeton Expo et la plateforme quand l'autorisation est accordée", async () => {
    await expect(registerForPush()).resolves.toEqual({ token: PUSH_TOKEN, platform: "ios" });
    // Le jeton est demandé pour le projet EAS de app.config.ts.
    expect(notifications().getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: "projet-eas-de-test",
    });
    expect(notifications().requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("demande l'autorisation si elle n'est pas encore accordée", async () => {
    notifications().getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    await expect(registerForPush()).resolves.toMatchObject({ token: PUSH_TOKEN });
    expect(notifications().requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it("renvoie null quand l'autorisation est refusée", async () => {
    notifications().getPermissionsAsync.mockResolvedValue({ status: "denied" });
    notifications().requestPermissionsAsync.mockResolvedValueOnce({ status: "denied" });
    await expect(registerForPush()).resolves.toBeNull();
    expect(notifications().getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("renvoie null sur un émulateur", async () => {
    device().isDevice = false;
    await expect(registerForPush()).resolves.toBeNull();
  });

  it("renvoie null, sans erreur, quand le jeton est introuvable (Firebase absent du build)", async () => {
    notifications().getExpoPushTokenAsync.mockRejectedValueOnce(new Error("FirebaseApp"));
    await expect(registerForPush()).resolves.toBeNull();
  });

  it("désactive le push sans erreur quand le module natif expo-notifications est absent", async () => {
    // Version de l'app installée avant l'ajout du module : son chargement échoue.
    nativeModules.notifications = () =>
      Promise.reject(new Error("Cannot find native module 'ExpoPushTokenManager'"));
    await expect(loadNotifications()).resolves.toBeNull();
    await expect(registerForPush()).resolves.toBeNull();
    expect(notifications().getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("désactive le push sans erreur quand le module natif expo-device est absent", async () => {
    nativeModules.device = () =>
      Promise.reject(new Error("Cannot find native module 'ExpoDevice'"));
    await expect(registerForPush()).resolves.toBeNull();
    expect(notifications().getExpoPushTokenAsync).not.toHaveBeenCalled();
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

describe("session et jeton push", () => {
  interface Call {
    method: string;
    url: string;
    authorization: string | null;
    body: unknown;
  }
  const calls: Call[] = [];
  const realFetch = globalThis.fetch;
  const fetchFn = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      method: init?.method ?? "GET",
      url,
      authorization: new Headers(init?.headers).get("Authorization"),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    if (url.endsWith("/auth/login")) {
      return new Response(JSON.stringify(LOGIN), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(null, { status: 204 });
  });
  beforeAll(() => {
    globalThis.fetch = fetchFn as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });
  beforeEach(() => {
    calls.length = 0;
    device().isDevice = true;
    notifications().getPermissionsAsync.mockResolvedValue({ status: "granted" });
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
  const pushCalls = () => calls.filter((c) => c.url.includes("/push-tokens"));

  async function signIn() {
    const hook = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(hook.result.current).not.toBeNull());
    await act(() => hook.result.current.login({ email: "operator@demo.local", password: "x" }));
    return hook;
  }

  it("enregistre le jeton après la connexion puis le supprime à la déconnexion", async () => {
    const hook = await signIn();
    await waitFor(() => expect(pushCalls()).toHaveLength(1));
    expect(pushCalls()[0]).toMatchObject({
      method: "POST",
      url: `${BASE_URL}/push-tokens`,
      authorization: `Bearer ${JWT}`,
      body: { token: PUSH_TOKEN, platform: "ios" },
    });

    await act(async () => hook.result.current.logout());
    await waitFor(() => expect(pushCalls()).toHaveLength(2));
    // Les crochets du jeton Expo sont encodés dans l'URL, et le JWT part encore avec la requête.
    expect(pushCalls()[1]).toMatchObject({
      method: "DELETE",
      url: `${BASE_URL}/push-tokens/${encodeURIComponent(PUSH_TOKEN)}`,
      authorization: `Bearer ${JWT}`,
    });
    await waitFor(() => expect(hook.result.current.user).toBeNull());
    await hook.unmount();
  });

  it("demande l'autorisation après la connexion", async () => {
    notifications().getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    notifications().requestPermissionsAsync.mockClear();
    const hook = await signIn();
    await waitFor(() => expect(notifications().requestPermissionsAsync).toHaveBeenCalled());
    await hook.unmount();
  });

  it("ne demande rien à l'API quand les notifications sont refusées", async () => {
    notifications().getPermissionsAsync.mockResolvedValue({ status: "denied" });
    notifications().requestPermissionsAsync.mockResolvedValueOnce({ status: "denied" });
    const hook = await signIn();
    await waitFor(() => expect(hook.result.current.user).not.toBeNull());
    await act(async () => hook.result.current.logout());
    await waitFor(() => expect(hook.result.current.user).toBeNull());
    expect(pushCalls()).toHaveLength(0);
    await hook.unmount();
  });

  it("la connexion réussit même si l'enregistrement du jeton échoue", async () => {
    fetchFn.mockImplementationOnce(async () => {
      return new Response(JSON.stringify(LOGIN), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    fetchFn.mockImplementationOnce(async () => {
      throw new TypeError("Network request failed");
    });
    const hook = await signIn();
    await waitFor(() => expect(hook.result.current.user).not.toBeNull());
    await hook.unmount();
  });

  it("la connexion réussit même si l'autorisation est refusée", async () => {
    notifications().getPermissionsAsync.mockResolvedValue({ status: "denied" });
    notifications().requestPermissionsAsync.mockResolvedValueOnce({ status: "denied" });
    const hook = await signIn();
    await waitFor(() => expect(hook.result.current.user).not.toBeNull());
    await hook.unmount();
  });
});

describe("source d'exemple", () => {
  it("les méthodes de jeton push n'ont aucun effet", async () => {
    const source: DataSource = new MockDataSource("normal");
    await expect(
      source.registerPushToken({ token: PUSH_TOKEN, platform: "android" }),
    ).resolves.toBeUndefined();
    await expect(source.deletePushToken(PUSH_TOKEN)).resolves.toBeUndefined();
  });
});
