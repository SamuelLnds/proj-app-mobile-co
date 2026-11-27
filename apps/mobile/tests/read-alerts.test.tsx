import type { Alert, AlertPage } from "@solar/contracts";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AlertsScreen from "../app/(tabs)/alerts";
import { QueryProvider, useAlerts, useReadAlerts, useUnreadAlertCount } from "../src/api";
import { dataSource, DataSourceError } from "../src/data";
import {
  createMemoryReadAlertStore,
  loadReadAlerts,
  saveReadAlerts,
  setReadAlertStore,
} from "../src/storage";
import { ThemeProvider } from "../src/theme";

const mockPush = jest.fn();
const mockRouter = { push: mockPush };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

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
    startedAt: new Date(Date.UTC(2026, 10, 26, 10, 0, 0) - n * 60_000).toISOString(),
    endedAt: null,
    ...overrides,
  };
}

/** Alertes servies par la fausse source, modifiables d'un test à l'autre. */
let served: Alert[];

function serve(alerts: Alert[]) {
  served = alerts;
}

beforeEach(() => {
  mockPush.mockClear();
  serve([
    alert(1, { panel: PANEL }),
    alert(2, { severity: "critical", type: "device_offline" }),
    alert(3, { severity: "info", type: "battery_full" }),
    alert(4, {
      status: "resolved",
      endedAt: new Date(Date.UTC(2026, 10, 26, 9, 0, 0)).toISOString(),
    }),
  ]);
  jest.spyOn(dataSource, "listAlerts").mockImplementation(async (query) => {
    const items = served.filter((a) => !query?.status || a.status === query.status);
    return { items, next: null } satisfies AlertPage;
  });
});

afterEach(() => jest.restoreAllMocks());

const hookWrapper = ({ children }: { children: ReactNode }) => (
  <QueryProvider>{children}</QueryProvider>
);

const useProbe = () => ({
  count: useUnreadAlertCount(),
  read: useReadAlerts(),
  active: useAlerts("active"),
});

describe("pastille : alertes actives non lues", () => {
  it("compte les alertes actives, jamais les résolues", async () => {
    const { result } = await renderHook(useProbe, { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.count).toBe(3));
  });

  it("au premier lancement, toutes les alertes actives sont non lues", async () => {
    const { result } = await renderHook(useProbe, { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.count).toBe(3));
    expect(result.current.read.readIds.size).toBe(0);
  });

  it("ne compte pas les alertes déjà lues et mémorisées sur le téléphone", async () => {
    await saveReadAlerts([id(101)]);
    const { result } = await renderHook(useProbe, { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.count).toBe(2));
  });

  it("baisse aussitôt quand une alerte est marquée lue, sans nouveau rafraîchissement", async () => {
    const { result } = await renderHook(useProbe, { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.count).toBe(3));
    const calls = jest.mocked(dataSource.listAlerts).mock.calls.length;

    await act(async () => result.current.read.markAlertRead(id(102)));

    await waitFor(() => expect(result.current.count).toBe(2));
    expect(jest.mocked(dataSource.listAlerts).mock.calls).toHaveLength(calls);
    await waitFor(async () => expect(await loadReadAlerts()).toEqual([id(102)]));
  });

  it("« tout marquer comme lu » ramène le compte à zéro", async () => {
    const { result } = await renderHook(useProbe, { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.count).toBe(3));
    await act(async () =>
      result.current.read.markAllAlertsRead(served.slice(0, 3).map((a) => a.id)),
    );
    await waitFor(() => expect(result.current.count).toBe(0));
    await waitFor(async () => expect(await loadReadAlerts()).toHaveLength(3));
  });

  it("remonte pour une nouvelle alerte", async () => {
    const { result } = await renderHook(useProbe, { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.count).toBe(3));
    await act(async () =>
      result.current.read.markAllAlertsRead(served.slice(0, 3).map((a) => a.id)),
    );
    await waitFor(() => expect(result.current.count).toBe(0));

    serve([alert(5), ...served]);
    await act(async () => {
      await result.current.active.refetch();
    });
    await waitFor(() => expect(result.current.count).toBe(1));
  });

  it("une alerte résolue puis rouverte (nouvel identifiant) est de nouveau non lue", async () => {
    const { result } = await renderHook(useProbe, { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.count).toBe(3));
    await act(async () => result.current.read.markAlertRead(id(102)));
    await waitFor(() => expect(result.current.count).toBe(2));

    // L'alerte 102 est résolue, puis rouverte sous un autre identifiant.
    serve([alert(6, { severity: "critical", type: "device_offline" }), alert(1), alert(3)]);
    await act(async () => {
      await result.current.active.refetch();
    });
    await waitFor(() => expect(result.current.count).toBe(3));
  });

  it("retire de la mémoire locale les alertes qui ne sont plus actives", async () => {
    const store = createMemoryReadAlertStore();
    setReadAlertStore(store);
    await saveReadAlerts([id(101), id(102), "ancienne-alerte"]);
    const { result } = await renderHook(useProbe, { wrapper: hookWrapper });

    // « ancienne-alerte » n'est plus active : elle est purgée dès la première liste reçue.
    await waitFor(() => expect([...store.rows.keys()].sort()).toEqual([id(101), id(102)].sort()));
    await waitFor(() => expect(result.current.count).toBe(1));

    // L'alerte 101 est résolue à son tour.
    serve(served.filter((a) => a.id !== id(101)));
    await act(async () => {
      await result.current.active.refetch();
    });
    await waitFor(() => expect([...store.rows.keys()]).toEqual([id(102)]));
    expect(result.current.read.readIds.has(id(101))).toBe(false);
  });

  it("ne purge pas quand la liste des alertes actives est incomplète", async () => {
    const store = createMemoryReadAlertStore();
    setReadAlertStore(store);
    await saveReadAlerts(["alerte-hors-page"]);
    jest.mocked(dataSource.listAlerts).mockImplementation(async () => ({
      items: served.slice(0, 3),
      next: "curseur",
    }));
    const { result } = await renderHook(useProbe, { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.count).toBe(3));
    expect([...store.rows.keys()]).toEqual(["alerte-hors-page"]);
  });

  it("ne marque pas deux fois la même alerte et écrit une seule fois", async () => {
    const store = createMemoryReadAlertStore();
    const add = jest.spyOn(store, "add");
    setReadAlertStore(store);
    const { result } = await renderHook(useProbe, { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.count).toBe(3));
    await act(async () => result.current.read.markAlertRead(id(101)));
    await act(async () => result.current.read.markAlertRead(id(101)));
    expect(add).toHaveBeenCalledTimes(1);
  });
});

describe("hors ligne (copie locale SQLite)", () => {
  it("compte et mémorise les alertes lues avec la copie locale des alertes", async () => {
    // Première session en ligne : la liste est enregistrée dans la copie locale.
    const online = await renderHook(useProbe, { wrapper: hookWrapper });
    await waitFor(() => expect(online.result.current.count).toBe(3));
    await act(async () => online.result.current.read.markAlertRead(id(102)));
    await waitFor(async () => expect(await loadReadAlerts()).toEqual([id(102)]));
    await online.unmount();

    // Redémarrage sans réseau : la liste vient de la copie locale, l'état lu de la table locale.
    jest
      .mocked(dataSource.listAlerts)
      .mockRejectedValue(new DataSourceError("NETWORK_ERROR", "Hors ligne"));
    const offline = await renderHook(useProbe, { wrapper: hookWrapper });
    await waitFor(() => expect(offline.result.current.count).toBe(2));
    await act(async () => offline.result.current.read.markAlertRead(id(101)));
    await waitFor(() => expect(offline.result.current.count).toBe(1));
  });
});

describe("source mock", () => {
  it("la pastille et « tout marquer comme lu » fonctionnent avec les alertes d'exemple", async () => {
    jest.restoreAllMocks();
    const { result } = await renderHook(useProbe, { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.count).toBeGreaterThan(0), { timeout: 3000 });
    const ids = (result.current.active.data?.items ?? []).map((a) => a.id);
    await act(async () => result.current.read.markAllAlertsRead(ids));
    await waitFor(() => expect(result.current.count).toBe(0));
  });
});

function Badge() {
  return <Text testID="badge">{useUnreadAlertCount()}</Text>;
}

const screenProviders = (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    }}
  >
    <QueryProvider>
      <ThemeProvider>
        <Badge />
        <AlertsScreen />
      </ThemeProvider>
    </QueryProvider>
  </SafeAreaProvider>
);

const badge = () => Number(screen.getByTestId("badge").props.children);

describe("écran Alertes", () => {
  it("signale une alerte non lue par un libellé « non lue » et le mot « Nouvelle »", async () => {
    await render(screenProviders);
    expect(
      await screen.findByLabelText(/^Avertissement, non lue : Message de l'alerte 1\./),
    ).toBeTruthy();
    expect(screen.getByLabelText(/^Critique, non lue : Message de l'alerte 2\./)).toBeTruthy();
    expect(screen.getAllByText("Nouvelle")).toHaveLength(3);
  });

  it("un appui sur l'alerte la marque comme lue et fait baisser la pastille aussitôt", async () => {
    await render(screenProviders);
    const row = await screen.findByLabelText(/^Critique, non lue : Message de l'alerte 2\./);
    await waitFor(() => expect(badge()).toBe(3));

    await fireEvent.press(row);

    await waitFor(() => expect(badge()).toBe(2));
    expect(screen.queryByLabelText(/^Critique, non lue/)).toBeNull();
    expect(screen.getByLabelText(/^Critique : Message de l'alerte 2\./)).toBeTruthy();
    expect(screen.getAllByText("Nouvelle")).toHaveLength(2);
    // L'alerte reste dans la liste, à sa place, et aucune navigation n'a eu lieu.
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText("Message de l'alerte 2")).toBeTruthy();
    await waitFor(async () => expect(await loadReadAlerts()).toEqual([id(102)]));
  });

  it("un second appui sur une alerte déjà lue ne fait rien", async () => {
    await render(screenProviders);
    await fireEvent.press(await screen.findByLabelText(/^Critique, non lue/));
    await waitFor(() => expect(badge()).toBe(2));
    await fireEvent.press(screen.getByLabelText(/^Critique : Message de l'alerte 2\./));
    expect(badge()).toBe(2);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("« Tout marquer comme lu » vide le compte puis disparaît", async () => {
    await render(screenProviders);
    const button = await screen.findByRole("button", { name: "Tout marquer comme lu" });
    await waitFor(() => expect(badge()).toBe(3));

    await fireEvent.press(button);

    await waitFor(() => expect(badge()).toBe(0));
    expect(screen.queryByRole("button", { name: "Tout marquer comme lu" })).toBeNull();
    expect(screen.queryByText("Nouvelle")).toBeNull();
    expect(screen.queryByLabelText(/non lue/)).toBeNull();
  });

  it("le bouton « Tout marquer comme lu » n'apparaît pas quand tout est lu", async () => {
    await saveReadAlerts([id(101), id(102), id(103)]);
    await render(screenProviders);
    await screen.findByLabelText(/^Avertissement : Message de l'alerte 1\./);
    expect(screen.queryByRole("button", { name: "Tout marquer comme lu" })).toBeNull();
  });

  it("« Voir le panneau » ouvre le panneau sans marquer l'alerte comme lue", async () => {
    await render(screenProviders);
    const link = await screen.findByRole("link", { name: `Voir le panneau ${PANEL.name}` });
    await waitFor(() => expect(badge()).toBe(3));

    await fireEvent.press(link);

    expect(mockPush).toHaveBeenCalledWith(`/panel/${PANEL.id}`);
    expect(badge()).toBe(3);
    expect(screen.getByLabelText(/^Avertissement, non lue : Message de l'alerte 1\./)).toBeTruthy();
  });

  it("une alerte du site n'a pas de navigation : un seul lien pour les trois alertes", async () => {
    await render(screenProviders);
    await screen.findByLabelText(/^Critique, non lue/);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("« Voir le panneau » a une zone tactile d'au moins 48 px de haut", async () => {
    await render(screenProviders);
    const link = await screen.findByRole("link", { name: `Voir le panneau ${PANEL.name}` });
    const style = Object.assign({}, ...[link.props.style].flat(2).filter(Boolean));
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
  });

  it("onglet « Résolues » : pas de notion de lu", async () => {
    await render(screenProviders);
    await screen.findByLabelText(/^Critique, non lue/);
    await fireEvent.press(screen.getByRole("radio", { name: "Résolues" }));

    expect(
      await screen.findByLabelText(/^Avertissement, résolue : Message de l'alerte 4\./),
    ).toBeTruthy();
    expect(screen.queryByText("Nouvelle")).toBeNull();
    expect(screen.queryByRole("button", { name: "Tout marquer comme lu" })).toBeNull();
    // La pastille ne compte toujours que les alertes actives non lues.
    expect(badge()).toBe(3);
  });

  it("l'état lu est conservé quand l'écran est affiché de nouveau", async () => {
    const first = await render(screenProviders);
    await fireEvent.press(await screen.findByLabelText(/^Critique, non lue/));
    await waitFor(async () => expect(await loadReadAlerts()).toEqual([id(102)]));
    await first.unmount();

    await render(screenProviders);
    await screen.findByLabelText(/^Critique : Message de l'alerte 2\./);
    await waitFor(() => expect(badge()).toBe(2));
  });
});
