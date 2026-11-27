import type { PanelSummary } from "@solar/contracts";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { Park3D, park3dLoader } from "../src/components/Park3D";
import type { Park3DSceneProps } from "../src/components/Park3DScene";
import { ThemeProvider } from "../src/theme";
import { parkScene } from "../src/utils/park-layout";

const panel = (n: number, overrides: Partial<PanelSummary> = {}): PanelSummary => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  code: `P0${n}`,
  name: `Panneau P0${n}`,
  latitude: 47.25,
  longitude: -1.55,
  placed: true,
  source: "seed",
  status: "normal",
  latestProduction: 150,
  latestTemperature: 40,
  ...overrides,
});

describe("scène 3D du parc", () => {
  it("place les panneaux en mètres autour du centre, sans les non positionnés", () => {
    const scene = parkScene([
      panel(1, { latitude: 47.25, longitude: -1.55 }),
      panel(2, { latitude: 47.25009, longitude: -1.55 }),
      panel(3, { latitude: null, longitude: null, placed: false }),
    ]);
    expect(scene.panels.map((p) => p.code)).toEqual(["P01", "P02"]);
    const [a, b] = scene.panels;
    // 0,00009° de latitude ≈ 10 m ; le nord est vers -z, le centre à mi-chemin.
    expect(b!.z - a!.z).toBeCloseTo(-10.02, 1);
    expect(a!.z + b!.z).toBeCloseTo(0, 6);
    expect(a!.x).toBeCloseTo(0, 6);
    expect(scene.extent).toBeGreaterThanOrEqual(10);
  });

  it("garde une étendue minimale pour un parc vide ou d'un seul panneau", () => {
    expect(parkScene([]).extent).toBe(10);
    expect(parkScene([panel(1)]).extent).toBe(10);
  });
});

/** Scène factice : un bouton par panneau (la vraie demande un contexte WebGL). */
function FakeScene({ scene, onSelect }: Park3DSceneProps) {
  return (
    <>
      {scene.panels.map((p) => (
        <Pressable key={p.id} accessibilityRole="button" onPress={() => onSelect(p.id)}>
          <Text>{`3D ${p.code}`}</Text>
        </Pressable>
      ))}
    </>
  );
}

afterEach(() => jest.restoreAllMocks());

describe("vue 3D (Park3D)", () => {
  const panels = [panel(1), panel(2, { status: "alert" }), panel(3, { status: "no_data" })];

  it("résume le parc pour le lecteur d'écran et renvoie vers la vue Liste", async () => {
    jest.spyOn(park3dLoader, "load").mockResolvedValue({ default: FakeScene });
    await render(
      <ThemeProvider>
        <Park3D panels={panels} selectedId={null} onSelect={() => undefined} />
      </ThemeProvider>,
    );
    expect(
      screen.getByLabelText(
        "Vue 3D du parc : 3 panneaux, dont 1 en alerte et 1 sans données. Les mêmes informations sont dans la vue Liste.",
      ),
    ).toBeTruthy();
  });

  it("toucher un panneau de la scène le sélectionne", async () => {
    jest.spyOn(park3dLoader, "load").mockResolvedValue({ default: FakeScene });
    const onSelect = jest.fn();
    await render(
      <ThemeProvider>
        <Park3D panels={panels} selectedId={null} onSelect={onSelect} />
      </ThemeProvider>,
    );
    await fireEvent.press(await screen.findByText("3D P02"));
    expect(onSelect).toHaveBeenCalledWith(panels[1]);
  });

  it("sans module 3D (ancienne version de l'app) : un message, rien ne plante", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(park3dLoader, "load").mockRejectedValue(new Error("expo-gl absent"));
    await render(
      <ThemeProvider>
        <Park3D panels={panels} selectedId={null} onSelect={() => undefined} />
      </ThemeProvider>,
    );
    expect(
      await screen.findByText(/La vue 3D n'est pas disponible dans cette version de l'app/),
    ).toBeTruthy();
  });
});
