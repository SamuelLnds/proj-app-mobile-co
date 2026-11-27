import type { PanelDetail, User } from "@solar/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import NewPanelScreen, { cameraLoader, type CameraModule } from "../app/panel/new";
import { QueryProvider } from "../src/api";
import { AuthProvider } from "../src/auth/AuthProvider";
import { saveSession } from "../src/auth/session";
import { dataSource, DataSourceError, MockDataSource } from "../src/data";
import { MOCK_PASSWORD } from "../src/data/mock/fixtures";
import * as location from "../src/utils/location";
import { parsePanelQr } from "../src/utils/panel-qr";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

const OPERATOR: User = {
  id: "00000000-0000-4000-8002-000000000001",
  email: "operator@demo.local",
  name: "Exploitant démo",
  role: "operator",
};
const VIEWER: User = {
  id: "00000000-0000-4000-8002-000000000002",
  email: "viewer@demo.local",
  name: "Lecteur démo",
  role: "viewer",
};

describe("QR code d'un panneau", () => {
  it("lit solar:panel:<code> et un code seul, refuse le reste", () => {
    expect(parsePanelQr("solar:panel:P21")).toBe("P21");
    expect(parsePanelQr(" SOLAR:PANEL:p121 ")).toBe("P121");
    expect(parsePanelQr("p07")).toBe("P07");
    expect(parsePanelQr("https://exemple.fr")).toBeNull();
    expect(parsePanelQr("solar:panel:21")).toBeNull();
  });
});

describe("source d'exemple : ajout d'un panneau", () => {
  async function as(user: User) {
    const source = new MockDataSource("normal", Date.now, 0);
    await source.login({ email: user.email, password: MOCK_PASSWORD });
    const [site] = await source.listSites();
    return { source, siteId: site!.id };
  }

  it("ajoute un panneau positionné, refuse un code existant et un lecteur", async () => {
    const { source, siteId } = await as(OPERATOR);
    const created = await source.createPanel(siteId, {
      code: "P40",
      latitude: 47.25,
      longitude: -1.55,
    });
    expect(created).toMatchObject({
      code: "P40",
      name: "Panneau P40",
      source: "manual",
      placed: true,
      ratedPowerW: 200,
    });
    expect((await source.listPanels(siteId)).some((p) => p.code === "P40")).toBe(true);
    await expect(
      source.createPanel(siteId, { code: "P01", latitude: 0, longitude: 0 }),
    ).rejects.toMatchObject({
      code: "PANEL_CODE_TAKEN",
    });
    const viewer = await as(VIEWER);
    await expect(
      viewer.source.createPanel(viewer.siteId, { code: "P41", latitude: 0, longitude: 0 }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

const providers = (children: ReactNode) => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    }}
  >
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  </SafeAreaProvider>
);

async function renderAs(user: User) {
  // La source d'exemple reconnaît l'utilisateur à son jeton `mock-<rôle>`.
  await saveSession({ token: `mock-${user.role}`, expiresAt: "2099-01-01T00:00:00.000Z", user });
  await render(providers(<NewPanelScreen />));
}

const created = (code: string): PanelDetail => ({
  id: "00000000-0000-4000-8003-000000000900",
  code,
  name: `Panneau ${code}`,
  latitude: 47.25,
  longitude: -1.55,
  placed: true,
  source: "manual",
  status: "no_data",
  latestProduction: null,
  latestTemperature: null,
  ratedPowerW: 200,
  expectedProduction: null,
  activeAlerts: [],
});

/** Caméra factice : un bouton simule la lecture d'un QR code. */
function fakeCamera(granted: boolean): CameraModule {
  return {
    Camera: { requestCameraPermissionsAsync: async () => ({ granted }) },
    CameraView: ({ onBarcodeScanned }) => (
      <Pressable
        accessibilityRole="button"
        onPress={() => onBarcodeScanned?.({ data: "solar:panel:P42" })}
      >
        <Text>Scanner (test)</Text>
      </Pressable>
    ),
  };
}

/** « Utiliser ma position » n'est actif qu'une fois le site chargé. */
async function pressLocate() {
  const button = await screen.findByRole("button", { name: "Utiliser ma position" });
  await waitFor(() => expect(button).not.toBeDisabled());
  await fireEvent.press(button);
}

beforeEach(() => mockReplace.mockClear());
afterEach(() => jest.restoreAllMocks());

describe("écran d'ajout d'un panneau", () => {
  it("données d'exemple : saisie du code, position du téléphone, ajout puis ouverture du détail", async () => {
    const create = jest.spyOn(dataSource, "createPanel");
    await renderAs(OPERATOR);
    const add = await screen.findByRole("button", { name: "Ajouter le panneau" });
    expect(add).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Code du panneau"), "p40");
    await pressLocate();
    expect(await screen.findByText(/Position du téléphone : /)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Ajouter le panneau" }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(create.mock.calls[0]![1]).toMatchObject({ code: "P40", ratedPowerW: 200 });
    expect(mockReplace.mock.calls[0]![0]).toMatch(/^\/panel\//);
  });

  it("refuse un code déjà présent avec un message clair", async () => {
    await renderAs(OPERATOR);
    await fireEvent.changeText(await screen.findByLabelText("Code du panneau"), "P01");
    await pressLocate();
    await screen.findByText(/Position du téléphone : /);
    await fireEvent.press(screen.getByRole("button", { name: "Ajouter le panneau" }));
    expect(await screen.findByText("Ajout impossible")).toBeTruthy();
    expect(screen.getByText(/Un panneau P01 existe déjà sur ce site/)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("source api : lit le code dans le QR code avec la caméra", async () => {
    jest.replaceProperty(dataSource, "kind", "api" as never);
    jest.spyOn(cameraLoader, "load").mockResolvedValue(fakeCamera(true));
    await renderAs(OPERATOR);
    await fireEvent.press(await screen.findByRole("button", { name: "Scanner (test)" }));
    expect(await screen.findByText("P42")).toBeTruthy();
    expect(screen.getByText("Code lu")).toBeTruthy();
  });

  it("caméra refusée : explication et saisie du code à la main", async () => {
    jest.replaceProperty(dataSource, "kind", "api" as never);
    jest.spyOn(cameraLoader, "load").mockResolvedValue(fakeCamera(false));
    await renderAs(OPERATOR);
    expect(await screen.findByText("Caméra non autorisée")).toBeTruthy();
    expect(screen.getByText(/sert à lire le QR code du panneau/)).toBeTruthy();
    expect(screen.getByLabelText("Code du panneau")).toBeTruthy();
  });

  it("localisation refusée : explication, saisie des coordonnées, puis ajout", async () => {
    jest.spyOn(location, "locatePhone").mockRejectedValue(new location.LocationRefusedError());
    const create = jest.spyOn(dataSource, "createPanel").mockResolvedValue(created("P43"));
    await renderAs(OPERATOR);
    await fireEvent.changeText(await screen.findByLabelText("Code du panneau"), "P43");
    await pressLocate();
    expect(await screen.findByText("Localisation non autorisée")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Latitude"), "47,2503");
    await fireEvent.changeText(screen.getByLabelText("Longitude"), "-1,5501");
    await fireEvent.press(screen.getByRole("button", { name: "Ajouter le panneau" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]![1]).toMatchObject({
      code: "P43",
      latitude: 47.2503,
      longitude: -1.5501,
    });
  });

  it("un lecteur ne voit aucun champ", async () => {
    await renderAs(VIEWER);
    expect(await screen.findByText("Réservé aux exploitants")).toBeTruthy();
    expect(screen.queryByLabelText("Code du panneau")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ajouter le panneau" })).toBeNull();
  });

  it("transmet l'erreur de l'API telle quelle", async () => {
    jest
      .spyOn(dataSource, "createPanel")
      .mockRejectedValue(
        new DataSourceError("PANEL_CODE_TAKEN", "Un panneau P44 existe déjà sur ce site."),
      );
    await renderAs(OPERATOR);
    await fireEvent.changeText(await screen.findByLabelText("Code du panneau"), "P44");
    await pressLocate();
    await screen.findByText(/Position du téléphone : /);
    await fireEvent.press(screen.getByRole("button", { name: "Ajouter le panneau" }));
    expect(await screen.findByText("Un panneau P44 existe déjà sur ce site.")).toBeTruthy();
  });
});
