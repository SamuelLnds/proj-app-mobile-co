import { render, screen } from "@testing-library/react-native";

import { Banner, Button, Segmented, StatusChip } from "../src/components";
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
