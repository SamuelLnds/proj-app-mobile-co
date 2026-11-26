import NetInfo from "@react-native-community/netinfo";
import { render, screen } from "@testing-library/react-native";

import SupervisionScreen from "../app/(tabs)/index";
import { QueryProvider, withLocalCopy } from "../src/api";
import { resetLastSync, setLastSync } from "../src/api/last-sync";
import { AuthProvider } from "../src/auth/AuthProvider";
import { OfflineBanner } from "../src/components";
import { ApiDataSource, DataSourceError } from "../src/data";
import { saveResponse } from "../src/storage";
import { ThemeProvider } from "../src/theme";
import { speakPower } from "../src/utils/format";

const providers = (children: React.ReactNode) => (
  <QueryProvider>
    <AuthProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </AuthProvider>
  </QueryProvider>
);

describe("Supervision (#34)", () => {
  it("lit les puissances avec leurs unités en toutes lettres", () => {
    expect(speakPower(2664.4)).toBe("2,66 kilowatts");
    expect(speakPower(160)).toBe("160 watts");
  });

  it("expose les mesures au lecteur d'écran", async () => {
    await render(providers(<SupervisionScreen />));
    expect(await screen.findByLabelText(/^Production .* attendue .* ensoleillement/)).toBeTruthy();
    expect(screen.getByLabelText(/^Batterie \d+ pour cent/)).toBeTruthy();
    expect(screen.getByLabelText(/^Réseau : .* injectés$/)).toBeTruthy();
  });
});

describe("affichage sans réseau (#37)", () => {
  afterEach(() => {
    resetLastSync();
    jest.restoreAllMocks();
  });

  it("affiche « Hors ligne » et la date des données, seulement sans réseau", async () => {
    setLastSync("2026-11-26T09:15:00.000Z");
    const useNetInfo = jest.spyOn(NetInfo, "useNetInfo");

    useNetInfo.mockReturnValue({ isConnected: true } as ReturnType<typeof NetInfo.useNetInfo>);
    const online = await render(providers(<OfflineBanner />));
    expect(screen.queryByText("Hors ligne")).toBeNull();
    await online.unmount();

    useNetInfo.mockReturnValue({ isConnected: false } as ReturnType<typeof NetInfo.useNetInfo>);
    await render(providers(<OfflineBanner />));
    expect(screen.getByText("Hors ligne")).toBeTruthy();
    expect(screen.getByText(/^Données du 26 nov\./)).toBeTruthy();
  });

  it("la date affichée est celle de la copie locale relue sans réseau", async () => {
    const key = ["sites"];
    await saveResponse(JSON.stringify(key), [{ id: "x" }]);
    const offline = () =>
      Promise.reject(new DataSourceError("NETWORK_ERROR", "Serveur injoignable."));
    await expect(withLocalCopy(key, offline)).resolves.toEqual([{ id: "x" }]);
  });
});

describe("suppression d'un panneau (#62)", () => {
  it("envoie DELETE /v1/panels/{id} et accepte une réponse 204", async () => {
    const fetchFn = jest.fn(async () => new Response(null, { status: 204 }));
    const source = new ApiDataSource("http://localhost:3000/v1", fetchFn);
    await expect(
      source.deletePanel("00000000-0000-4000-8000-000000000121"),
    ).resolves.toBeUndefined();
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost:3000/v1/panels/00000000-0000-4000-8000-000000000121",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
