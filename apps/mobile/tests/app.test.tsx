import { ROUTES } from "@solar/contracts";
import { render, screen } from "@testing-library/react-native";

import SupervisionScreen from "../app/(tabs)/index";
import { QueryProvider } from "../src/api";
import { AuthProvider } from "../src/auth/AuthProvider";
import { ThemeProvider } from "../src/theme";

describe("app mobile", () => {
  it("affiche l'écran de supervision", async () => {
    await render(
      <QueryProvider>
        <AuthProvider>
          <ThemeProvider>
            <SupervisionScreen />
          </ThemeProvider>
        </AuthProvider>
      </QueryProvider>,
    );
    expect(screen.getByRole("header", { name: "Supervision" })).toBeTruthy();
  });

  it("importe le paquet partagé @solar/contracts", () => {
    expect(Object.keys(ROUTES).length).toBeGreaterThan(0);
  });
});
