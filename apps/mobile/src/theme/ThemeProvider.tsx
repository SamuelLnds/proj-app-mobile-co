import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { darkColors, lightColors, type ColorTokens } from "./tokens";

export type ColorSchemeName = "light" | "dark";

type ThemeValue = { scheme: ColorSchemeName; colors: ColorTokens };

const ThemeContext = createContext<ThemeValue>({ scheme: "light", colors: lightColors });

/** Fournit les couleurs du thème choisi dans les réglages du téléphone (clair ou sombre). */
export function ThemeProvider({
  children,
  scheme: forcedScheme,
}: {
  children: ReactNode;
  /** Pour les tests : impose un thème au lieu de suivre le téléphone. */
  scheme?: ColorSchemeName;
}) {
  const systemScheme = useColorScheme();
  const scheme: ColorSchemeName = forcedScheme ?? (systemScheme === "dark" ? "dark" : "light");
  const value = useMemo(
    () => ({ scheme, colors: scheme === "dark" ? darkColors : lightColors }),
    [scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
