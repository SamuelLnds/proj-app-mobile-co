import type { User } from "@solar/contracts";
import { useQuery } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import MapScreen from "../app/(tabs)/map";
import SupervisionScreen from "../app/(tabs)/index";
import { QueryProvider, useAcceptEnrollment } from "../src/api";
import { AuthProvider } from "../src/auth/AuthProvider";
import { saveSession } from "../src/auth/session";
import { Screen } from "../src/components";
import { dataSource } from "../src/data";
import { ThemeProvider } from "../src/theme";

const OPERATOR: User = {
  id: "00000000-0000-4000-8002-000000000001",
  email: "operator@demo.local",
  name: "Exploitant démo",
  role: "operator",
};

const providers = (children: ReactNode) => (
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

/** Déclenche le geste « tirer pour rafraîchir » de l'écran affiché. */
async function pull() {
  const scroll = screen.getByTestId("screen-scroll");
  await act(async () => scroll.props.refreshControl.props.onRefresh());
}
const refreshing = () =>
  screen.getByTestId("screen-scroll").props.refreshControl.props.refreshing as boolean;

afterEach(() => jest.restoreAllMocks());

describe("geste de rafraîchissement commun (#127)", () => {
  it("relance toutes les requêtes affichées et garde l'indicateur jusqu'à la dernière", async () => {
    const calls = { a: 0, b: 0 };
    let releaseB: () => void = () => undefined;
    function Probes() {
      useQuery({ queryKey: ["probe-a"], queryFn: async () => ++calls.a, staleTime: Infinity });
      useQuery({
        queryKey: ["probe-b"],
        staleTime: Infinity,
        queryFn: () =>
          new Promise<number>((resolve) => {
            calls.b++;
            releaseB = () => resolve(calls.b);
            if (calls.b === 1) resolve(1);
          }),
      });
      return <Text>sondes</Text>;
    }
    await render(
      providers(
        <Screen title="Essai" refreshable>
          <Probes />
        </Screen>,
      ),
    );
    await waitFor(() => expect(calls).toEqual({ a: 1, b: 1 }));

    await pull();
    expect(calls).toEqual({ a: 2, b: 2 });
    // La requête b n'a pas répondu : l'indicateur reste affiché.
    expect(refreshing()).toBe(true);
    await act(async () => releaseB());
    await waitFor(() => expect(refreshing()).toBe(false));
  });

  it("garde les dernières données si une requête échoue", async () => {
    let fail = false;
    function Probe() {
      const query = useQuery({
        queryKey: ["probe-fail"],
        staleTime: Infinity,
        retry: false,
        queryFn: async () => {
          if (fail) throw new Error("réseau");
          return "données";
        },
      });
      return <Text>{query.data ?? "vide"}</Text>;
    }
    await render(
      providers(
        <Screen title="Essai" refreshable>
          <Probe />
        </Screen>,
      ),
    );
    expect(await screen.findByText("données")).toBeTruthy();
    fail = true;
    await pull();
    await waitFor(() => expect(refreshing()).toBe(false));
    expect(screen.getByText("données")).toBeTruthy();
  });

  it("Supervision : le geste relance le site et sa courbe", async () => {
    const getSite = jest.spyOn(dataSource, "getSite");
    const history = jest.spyOn(dataSource, "getSiteMeasurements");
    await render(providers(<SupervisionScreen />));
    await screen.findByLabelText(/^Production .* attendue/);
    await waitFor(() => expect(history).toHaveBeenCalled());
    const before = [getSite.mock.calls.length, history.mock.calls.length];
    await pull();
    await waitFor(() => expect(getSite.mock.calls.length).toBeGreaterThan(before[0]!));
    expect(history.mock.calls.length).toBeGreaterThan(before[1]!);
  });

  it("Carte : le geste relance les panneaux", async () => {
    await saveSession({
      token: "mock-operator",
      expiresAt: "2099-01-01T00:00:00.000Z",
      user: OPERATOR,
    });
    const listPanels = jest.spyOn(dataSource, "listPanels");
    await render(providers(<MapScreen />));
    // Premier chargement terminé : le sous-titre compte les panneaux.
    expect(await screen.findByText(/\d+ panneaux/)).toBeTruthy();
    const before = listPanels.mock.calls.length;
    await pull();
    await waitFor(() => expect(listPanels.mock.calls.length).toBeGreaterThan(before));
  });

  it("accepter une demande d'enrôlement relance aussi l'état du site", async () => {
    await saveSession({
      token: "mock-operator",
      expiresAt: "2099-01-01T00:00:00.000Z",
      user: OPERATOR,
    });
    jest.spyOn(dataSource, "acceptEnrollment").mockResolvedValue({} as never);
    const getSite = jest.spyOn(dataSource, "getSite");
    const wrapper = ({ children }: { children: ReactNode }) => providers(children);
    const { result } = await renderHook(
      () => {
        const site = useQuery({
          queryKey: ["sites", "s1"],
          queryFn: () => dataSource.getSite("s1").catch(() => null),
          staleTime: Infinity,
        });
        return { site, accept: useAcceptEnrollment() };
      },
      { wrapper },
    );
    // Premier chargement terminé (sinon la relecture rejoindrait la requête en cours).
    await waitFor(() => expect(result.current.site.isSuccess).toBe(true));
    expect(getSite).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.accept.mutateAsync({ id: "e1", body: { ttlHours: 8 } });
    });
    await waitFor(() => expect(getSite).toHaveBeenCalledTimes(2));
  });
});
