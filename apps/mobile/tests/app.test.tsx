import { render, screen } from "@testing-library/react-native";
import { ROUTES } from "@solar/contracts";

import SupervisionScreen from "../app/(tabs)/index";

describe("app mobile", () => {
  it("affiche le titre de l'écran de supervision", async () => {
    await render(<SupervisionScreen />);
    expect(screen.getByText("Supervision")).toBeTruthy();
  });

  it("importe le paquet partagé @solar/contracts", () => {
    expect(Object.keys(ROUTES).length).toBeGreaterThan(0);
  });
});
