import type { PanelSummary } from "@solar/contracts";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { Banner, Button, Gauge, Segmented, StatusChip } from "../src/components";
import { ParkPlan } from "../src/components/ParkPlan";
import { ThemeProvider } from "../src/theme";

describe("composants communs", () => {
  it("accompagne toujours l'état d'un mot", async () => {
    await render(
      <ThemeProvider scheme="dark">
        <StatusChip tone="warning" label="Avertissement" />
      </ThemeProvider>,
    );
    expect(screen.getByText("Avertissement")).toBeTruthy();
  });

  it("annonce un bandeau comme une alerte", async () => {
    await render(
      <ThemeProvider>
        <Banner tone="critical" title="Refusée : la batterie est pleine" />
      </ThemeProvider>,
    );
    expect(screen.getByText("Refusée : la batterie est pleine")).toBeTruthy();
  });

  it("expose l'état désactivé d'un bouton", async () => {
    await render(
      <ThemeProvider>
        <Button label="Appliquer" disabled />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: "Appliquer" })).toBeDisabled();
  });

  it("marque l'option choisie d'un sélecteur", async () => {
    await render(
      <ThemeProvider>
        <Segmented
          accessibilityLabel="Mode"
          value="manual"
          onChange={() => undefined}
          options={[
            { value: "manual", label: "Manuel" },
            { value: "automatic", label: "Automatique" },
          ]}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole("radio", { name: "Manuel" })).toBeSelected();
  });
});

describe("composants principaux (#52)", () => {
  it("la jauge remplit la part demandée, bornée entre 0 et 100 %", async () => {
    const widths: unknown[] = [];
    for (const value of [0.62, 1.4, -0.2]) {
      const { toJSON, unmount } = await render(
        <ThemeProvider>
          <Gauge value={value} color="red" />
        </ThemeProvider>,
      );
      const tree = toJSON() as unknown as {
        children: Array<{ props: { style: { width: string } } }>;
      };
      widths.push(tree.children[0]!.props.style.width);
      await unmount();
    }
    expect(widths).toEqual(["62%", "100%", "0%"]);
  });

  it("le plan place un marqueur par panneau positionné, avec son statut en mots, et le sélectionne", async () => {
    const panel = (n: number, overrides: Partial<PanelSummary> = {}): PanelSummary => ({
      id: `00000000-0000-4000-8000-00000000000${n}`,
      code: `P0${n}`,
      name: `Panneau P0${n}`,
      latitude: 47.25 + n * 0.0001,
      longitude: -1.55 + n * 0.0001,
      placed: true,
      source: "seed",
      status: "normal",
      latestProduction: 150,
      latestTemperature: 40,
      ...overrides,
    });
    const onSelect = jest.fn();
    const panels = [
      panel(1),
      panel(2, { status: "alert" }),
      panel(3, { status: "no_data" }),
      panel(4, { latitude: null, longitude: null, placed: false }),
    ];
    await render(
      <ThemeProvider>
        <ParkPlan panels={panels} selectedId={panels[1]!.id} onSelect={onSelect} />
      </ThemeProvider>,
    );
    // Les marqueurs n'apparaissent qu'une fois la largeur du plan connue.
    await fireEvent(screen.root!, "layout", {
      nativeEvent: { layout: { width: 390, height: 360, x: 0, y: 0 } },
    });
    expect(screen.getByRole("button", { name: "Panneau P01 : Normal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Panneau P03 : Sans données" })).toBeTruthy();
    const alert = screen.getByRole("button", { name: "Panneau P02 : Alerte" });
    expect(alert).toBeSelected();
    expect(screen.getByText("P02")).toBeTruthy();
    // Un panneau non positionné n'a pas de marqueur (il est dans la liste « à positionner »).
    expect(screen.queryByText("P04")).toBeNull();
    await fireEvent.press(alert);
    expect(onSelect).toHaveBeenCalledWith(panels[1]);
  });
});
