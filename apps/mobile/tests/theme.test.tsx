import { render } from "@testing-library/react-native";
import { Text } from "react-native";

import { ICON_PATHS } from "../src/theme/icon-paths";
import { darkColors, lightColors, ThemeProvider, useTheme } from "../src/theme";

function SchemeProbe() {
  const { scheme, colors } = useTheme();
  return <Text>{`${scheme} ${colors.surface}`}</Text>;
}

describe("thème", () => {
  it("définit les mêmes jetons en clair et en sombre", () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it("reprend les valeurs de la charte", () => {
    expect(lightColors.primary).toBe("#0b6e69");
    expect(darkColors.primary).toBe("#43c4b6");
    expect(lightColors.statusWarningSoft).toBe("#fbeadb");
  });

  it("fournit les couleurs du thème demandé", async () => {
    const view = await render(
      <ThemeProvider scheme="dark">
        <SchemeProbe />
      </ThemeProvider>,
    );
    expect(view.getByText(`dark ${darkColors.surface}`)).toBeTruthy();
  });

  it("contient un tracé pour chaque icône", () => {
    for (const paths of Object.values(ICON_PATHS)) expect(paths.length).toBeGreaterThan(0);
  });
});
