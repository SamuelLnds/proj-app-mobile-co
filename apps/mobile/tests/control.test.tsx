import {
  type SetpointPage,
  type SetpointRecord,
  type SiteDetail,
  type User,
} from "@solar/contracts";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import NetInfo from "@react-native-community/netinfo";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ControlScreen from "../app/(tabs)/control";
import { QueryProvider, useSetpoints } from "../src/api";
import { AuthProvider } from "../src/auth/AuthProvider";
import { saveSession } from "../src/auth/session";
import { dataSource } from "../src/data";
import { ThemeProvider } from "../src/theme";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SITE_ID = id(1);
const OPERATOR: User = {
  id: id(10),
  email: "operator@demo.local",
  name: "Exploitant",
  role: "operator",
};
const VIEWER: User = { id: id(11), email: "viewer@demo.local", name: "Lecteur", role: "viewer" };

function record(n: number, overrides: Partial<SetpointRecord> = {}): SetpointRecord {
  return {
    id: id(1000 + n),
    mode: "manual",
    requestedBatteryShare: 70,
    status: "applied",
    appliedBatteryShare: 70,
    rejectionReason: null,
    author: { id: OPERATOR.id, name: OPERATOR.name },
    createdAt: new Date(Date.UTC(2026, 10, 26, 10, 0, 0) - n * 60_000).toISOString(),
    respondedAt: null,
    ...overrides,
  };
}

async function loginAs(user: User) {
  await saveSession({ token: "t", expiresAt: "2099-01-01T00:00:00.000Z", user });
}

function site(overrides: Partial<SiteDetail> = {}): SiteDetail {
  return {
    id: SITE_ID,
    code: "SITE01",
    name: "Parc de démo",
    latitude: 47.25,
    longitude: -1.55,
    deviceStatus: "online",
    latestMeasurement: null,
    activeAlertCount: 0,
    peakPowerW: 4000,
    batteryCapacityWh: 10000,
    maxChargePowerW: 3000,
    currentSetpoint: null,
    controlState: null,
    deviceLastSeenAt: null,
    ...overrides,
  };
}

const providers = (children: React.ReactNode) => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    }}
  >
    <QueryProvider>
      <AuthProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </AuthProvider>
    </QueryProvider>
  </SafeAreaProvider>
);

function mockApi(detail: SiteDetail, pages: SetpointPage[] = [{ items: [], next: null }]) {
  jest.spyOn(dataSource, "listSites").mockResolvedValue([detail]);
  jest.spyOn(dataSource, "getSite").mockResolvedValue(detail);
  const list = jest.spyOn(dataSource, "listSetpoints");
  pages.forEach((page) => list.mockResolvedValueOnce(page));
  return list;
}

afterEach(() => jest.restoreAllMocks());

describe("Pilotage branché sur l'API (#45)", () => {
  it("pilotage ouvert pour un exploitant : bouton « Appliquer » actif", async () => {
    await loginAs(OPERATOR);
    mockApi(site());
    await render(providers(<ControlScreen />));
    const button = await screen.findByRole("button", { name: "Appliquer" });
    await waitFor(() => expect(button.props.accessibilityState?.disabled).toBeFalsy());
    expect(screen.queryByText("Consultation seule")).toBeNull();
  });

  it("lecteur : consultation seule, pilotage désactivé avec son message", async () => {
    await loginAs(VIEWER);
    mockApi(site());
    await render(providers(<ControlScreen />));
    expect(await screen.findByText("Consultation seule")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Appliquer" }).props.accessibilityState?.disabled,
    ).toBe(true);
  });

  it("objet hors ligne ou jamais vu : pilotage désactivé avec son message", async () => {
    await loginAs(OPERATOR);
    mockApi(site({ deviceStatus: "offline" }));
    const { unmount } = await render(providers(<ControlScreen />));
    expect(await screen.findByText("L'objet du site est hors ligne")).toBeTruthy();
    expect(screen.getByText("Pilotage indisponible tant que l'objet est hors ligne.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Appliquer" }).props.accessibilityState?.disabled,
    ).toBe(true);
    await unmount();

    mockApi(site({ deviceStatus: "unknown" }));
    await render(providers(<ControlScreen />));
    expect(await screen.findByText("L'objet du site est hors ligne")).toBeTruthy();
  });

  it("sans réseau : pilotage désactivé avec son message", async () => {
    await loginAs(OPERATOR);
    jest
      .spyOn(NetInfo, "useNetInfo")
      .mockReturnValue({ isConnected: false } as ReturnType<typeof NetInfo.useNetInfo>);
    mockApi(site());
    await render(providers(<ControlScreen />));
    try {
      expect(await screen.findByText("Pilotage indisponible sans réseau.")).toBeTruthy();
    } finally {
      // Le mock de netinfo est une fonction partagée : on lui rend son comportement par défaut.
      jest
        .spyOn(NetInfo, "useNetInfo")
        .mockReturnValue({ isConnected: true } as ReturnType<typeof NetInfo.useNetInfo>);
    }
  });

  it.each([
    [{ status: "applied" }, "Appliquée"],
    [
      { status: "partial", rejectionReason: "charge_limit", appliedBatteryShare: 50 },
      "Appliquée en partie",
    ],
    [
      { status: "rejected", rejectionReason: "battery_full", appliedBatteryShare: 0 },
      "Refusée : la batterie est pleine",
    ],
    [{ status: "no_response" }, "Sans réponse"],
  ] as const)("l'historique affiche le résultat %j", async (overrides, label) => {
    await loginAs(OPERATOR);
    mockApi(site(), [{ items: [record(0, overrides)], next: null }]);
    await render(providers(<ControlScreen />));
    expect(await screen.findAllByText(label)).toBeTruthy();
  });

  it("consigne en attente : pilotage verrouillé et message du délai de 30 s", async () => {
    await loginAs(OPERATOR);
    const pending = record(0, { status: "sent", appliedBatteryShare: null });
    mockApi(site({ currentSetpoint: pending }), [{ items: [pending], next: null }]);
    await render(providers(<ControlScreen />));
    expect(
      await screen.findByText("Sans réponse de l'objet sous 30 s, une alerte sera créée."),
    ).toBeTruthy();
    expect(screen.getAllByText("En attente").length).toBeGreaterThan(0);
  });

  it("envoie la consigne après confirmation", async () => {
    await loginAs(OPERATOR);
    mockApi(site());
    const create = jest
      .spyOn(dataSource, "createSetpoint")
      .mockResolvedValue(record(0, { status: "sent", appliedBatteryShare: null }));
    await render(providers(<ControlScreen />));
    const open = await screen.findByRole("button", { name: "Appliquer" });
    await waitFor(() => expect(open.props.accessibilityState?.disabled).toBeFalsy());
    fireEvent.press(open);
    expect(await screen.findByText("Appliquer cette consigne ?")).toBeTruthy();
    fireEvent.press(screen.getAllByRole("button", { name: "Appliquer" }).at(-1)!);
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(SITE_ID, { mode: "manual", batteryShare: 70 }),
    );
  });
});

describe("Historique paginé (#46)", () => {
  it("charge la page suivante avec le curseur `before`", async () => {
    await loginAs(OPERATOR);
    const first = Array.from({ length: 20 }, (_, n) => record(n));
    const second = Array.from({ length: 5 }, (_, n) => record(20 + n));
    const list = mockApi(site(), [
      { items: first, next: first[19]!.createdAt },
      { items: second, next: null },
    ]);
    const { result } = await renderHook(() => useSetpoints(SITE_ID), {
      wrapper: ({ children }) => providers(children),
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(list).toHaveBeenLastCalledWith(SITE_ID, { limit: 20, before: undefined });
    expect(result.current.hasNextPage).toBe(true);

    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(list).toHaveBeenLastCalledWith(SITE_ID, { limit: 20, before: first[19]!.createdAt });
    expect(result.current.data?.pages.flatMap((p) => p.items)).toHaveLength(25);
    expect(result.current.hasNextPage).toBe(false);
  });
});
