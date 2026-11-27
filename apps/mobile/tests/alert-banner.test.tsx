import type { Alert, AlertPage } from "@solar/contracts";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useEffect } from "react";

import { QueryProvider, useAlerts, useReadAlerts } from "../src/api";
import { dataSource } from "../src/data";
import {
  ALERT_BANNER_DURATION_MS,
  bannerTarget,
  highestSeverity,
  newBannerAlerts,
} from "../src/notifications/alert-banner";
import { AlertBanner } from "../src/notifications/AlertBanner";
import { saveReadAlerts } from "../src/storage";
import { ThemeProvider } from "../src/theme";

const mockPush = jest.fn();
let mockPathname = "/";
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

const mockUser = { id: "u1", email: "operator@demo.local", name: "Exploitant", role: "operator" };
jest.mock("../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: mockUser }) }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SITE = { id: id(1), name: "Parc de démo" };
const PANEL = { id: id(30), name: "Rangée A, panneau 3" };

function alert(n: number, overrides: Partial<Alert> = {}): Alert {
  return {
    id: id(100 + n),
    type: "low_production",
    severity: "warning",
    message: `Message de l'alerte ${n}`,
    status: "active",
    site: SITE,
    panel: null,
    startedAt: new Date(Date.UTC(2026, 10, 26, 10, n, 0)).toISOString(),
    endedAt: null,
    ...overrides,
  };
}

describe("newBannerAlerts", () => {
  const none = new Set<string>();

  it("ne signale rien au premier chargement", () => {
    expect(newBannerAlerts(null, [alert(1)], none)).toEqual([]);
  });

  it("signale une alerte active, nouvelle et non lue", () => {
    expect(newBannerAlerts(new Set([id(101)]), [alert(1), alert(2)], none)).toEqual([alert(2)]);
  });

  it("ignore une alerte déjà présente, déjà lue, d'information ou de type exclu", () => {
    const previous = new Set([id(101)]);
    const current = [
      alert(1),
      alert(2),
      alert(3, { severity: "info", type: "battery_full" }),
      alert(4, { type: "setpoint_rejected" }),
    ];
    expect(newBannerAlerts(previous, current, new Set([id(102)]))).toEqual([]);
  });
});

describe("bannerTarget et highestSeverity", () => {
  it("ouvre le panneau d'une alerte de panneau, sinon l'écran Alertes", () => {
    expect(bannerTarget([alert(1, { panel: PANEL })])).toBe(`/panel/${PANEL.id}`);
    expect(bannerTarget([alert(1)])).toBe("/alerts");
    expect(bannerTarget([alert(1, { panel: PANEL }), alert(2)])).toBe("/alerts");
  });

  it("retient la gravité la plus haute", () => {
    expect(highestSeverity([alert(1), alert(2, { severity: "critical" })])).toBe("critical");
    expect(highestSeverity([alert(1)])).toBe("warning");
  });
});

/** Alertes actives servies par la fausse source, modifiables pendant un test. */
let served: Alert[];
let client: QueryClient | undefined;
let unmount: (() => unknown) | undefined;
/** Le bandeau a reçu sa première liste : ses effets, déclarés avant, ont déjà tourné. */
let referenceSeen = false;

/**
 * Client de la requête rendue par ce test (jamais celui d'un arbre précédent). Placée après le
 * bandeau : quand son effet voit les deux listes chargées, celui du bandeau les a déjà vues.
 */
function ClientProbe() {
  const current = useQueryClient();
  if (!client) client = current;
  const active = useAlerts("active");
  const { loaded } = useReadAlerts();
  useEffect(() => {
    if (active.data && loaded) referenceSeen = true;
  }, [active.data, loaded]);
  return null;
}

/** Simule un rafraîchissement périodique de la liste des alertes. */
async function refresh(alerts: Alert[]) {
  served = alerts;
  await act(async () => {
    await client?.refetchQueries({ queryKey: ["alerts"] });
  });
  // La nouvelle liste est dans le cache, puis rendue et passée à la détection.
  await waitFor(() =>
    expect(client?.getQueryData<AlertPage>(["alerts", "active"])?.items).toEqual(alerts),
  );
  await act(async () => undefined);
}

async function renderBanner() {
  const view = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryProvider>
        <ThemeProvider>
          <AlertBanner />
          <ClientProbe />
        </ThemeProvider>
      </QueryProvider>
    </SafeAreaProvider>,
  );
  unmount = view.unmount;
  // Premier chargement terminé (alertes actives et alertes lues) : il sert de référence.
  await waitFor(() => expect(referenceSeen).toBe(true));
}

beforeEach(() => {
  client = undefined;
  referenceSeen = false;
  mockPush.mockClear();
  mockPathname = "/";
  served = [alert(1)];
  jest.spyOn(dataSource, "listAlerts").mockImplementation(async (query) => {
    const items = served.filter((a) => !query?.status || a.status === query.status);
    return { items, next: null } satisfies AlertPage;
  });
});

afterEach(async () => {
  await act(async () => {
    await unmount?.();
  });
  unmount = undefined;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("bandeau d'alerte app ouverte (#108)", () => {
  it("n'affiche rien au premier chargement", async () => {
    await renderBanner();
    expect(screen.queryByTestId("alert-banner")).toBeNull();
  });

  it("affiche une nouvelle alerte avec sa gravité, son texte, « Voir » et « Fermer »", async () => {
    await renderBanner();
    await refresh([alert(1), alert(2, { severity: "critical", type: "device_offline" })]);

    expect(await screen.findByTestId("alert-banner")).toBeTruthy();
    expect(screen.getByText("Critique")).toBeTruthy();
    expect(screen.getByText("Message de l'alerte 2")).toBeTruthy();
    expect(screen.getByText("Voir")).toBeTruthy();
    expect(screen.getByLabelText("Fermer")).toBeTruthy();
  });

  it("n'affiche rien pour une alerte lue, de type exclu ou sur l'écran Alertes", async () => {
    await saveReadAlerts([id(102)]);
    await renderBanner();
    await refresh([alert(1), alert(2), alert(3, { type: "setpoint_rejected" })]);
    expect(screen.queryByTestId("alert-banner")).toBeNull();

    mockPathname = "/alerts";
    await refresh([alert(1), alert(2), alert(4)]);
    expect(screen.queryByTestId("alert-banner")).toBeNull();
  });

  it("regroupe plusieurs nouvelles alertes en un seul bandeau qui ouvre l'écran Alertes", async () => {
    await renderBanner();
    await refresh([alert(1), alert(2, { panel: PANEL }), alert(3)]);

    expect(await screen.findByText("2 nouvelles alertes")).toBeTruthy();
    expect(screen.queryByText("Message de l'alerte 2")).toBeNull();
    await fireEvent.press(screen.getByText("Voir"));
    expect(mockPush).toHaveBeenCalledWith("/alerts");
    expect(screen.queryByTestId("alert-banner")).toBeNull();
  });

  it("« Voir » ouvre le détail du panneau sans marquer l'alerte comme lue", async () => {
    await renderBanner();
    await refresh([alert(1), alert(2, { panel: PANEL })]);

    await fireEvent.press(await screen.findByText("Voir"));
    expect(mockPush).toHaveBeenCalledWith(`/panel/${PANEL.id}`);
    expect(client?.getQueryData(["read-alerts"])).toEqual([]);
  });

  it("« Fermer » fait disparaître le bandeau", async () => {
    await renderBanner();
    await refresh([alert(1), alert(2)]);

    await fireEvent.press(await screen.findByLabelText("Fermer"));
    expect(screen.queryByTestId("alert-banner")).toBeNull();
  });

  it("le bandeau disparaît seul après le délai", async () => {
    await renderBanner();
    jest.useFakeTimers();
    await refresh([alert(1), alert(2)]);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("alert-banner")).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(ALERT_BANNER_DURATION_MS);
    });
    expect(screen.queryByTestId("alert-banner")).toBeNull();
  });
});
