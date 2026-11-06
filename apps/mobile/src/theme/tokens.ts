// Jetons de la charte « Parc Solaire » (docs/conception/05-charte-graphique.md).
// Les noms suivent ceux du design system ; seules ces valeurs définissent des couleurs dans l'app.

export const lightColors = {
  surface: "#f4f7f6",
  surfaceRaised: "#ffffff",
  surfaceSunken: "#e7edeb",
  ink: "#13202a",
  inkMuted: "#475763",
  line: "#d3dcdf",
  lineStrong: "#66777f",
  sun: "#f2b705",
  sunStrong: "#a87e00",
  onSun: "#13202a",
  primary: "#0b6e69",
  onPrimary: "#ffffff",
  grid: "#2f5fd0",
  statusNormal: "#1d7445",
  statusWarning: "#a84a07",
  statusCritical: "#b3261e",
  statusNodata: "#5f6f78",
  statusNormalSoft: "#e2f2e8",
  statusWarningSoft: "#fbeadb",
  statusCriticalSoft: "#f9e1df",
  focus: "#2f5fd0",
  disabledFill: "#c9d3d8",
  disabledLine: "#93a4ad",
  mapGround: "#e1e9e4",
  mapField: "#d3ddd6",
  mapPath: "#cbd5cf",
  scrim: "rgba(19, 32, 42, 0.55)",
};

export type ColorTokens = typeof lightColors;

export const darkColors: ColorTokens = {
  surface: "#0e161b",
  surfaceRaised: "#162128",
  surfaceSunken: "#0a1014",
  ink: "#e9eff2",
  inkMuted: "#a3b3bc",
  line: "#26343c",
  lineStrong: "#7d8f98",
  sun: "#f5c431",
  sunStrong: "#f5c431",
  onSun: "#13202a",
  primary: "#43c4b6",
  onPrimary: "#06201e",
  grid: "#86a8ff",
  statusNormal: "#58c98f",
  statusWarning: "#f5a04a",
  statusCritical: "#ff8a7a",
  statusNodata: "#93a4ad",
  statusNormalSoft: "#123323",
  statusWarningSoft: "#3a2410",
  statusCriticalSoft: "#3d1714",
  focus: "#86a8ff",
  disabledFill: "#2a3740",
  disabledLine: "#4c5c65",
  mapGround: "#15231f",
  mapField: "#1c2e29",
  mapPath: "#26383a",
  scrim: "rgba(0, 0, 0, 0.6)",
};

/** Noms des fichiers de police chargés au démarrage (voir src/theme/fonts.ts). */
export const fontFamilies = {
  display: "RedHatDisplay_700Bold",
  displaySemiBold: "RedHatDisplay_600SemiBold",
  text: "RedHatText_400Regular",
  textMedium: "RedHatText_500Medium",
  textBold: "RedHatText_700Bold",
  mono: "RedHatMono_500Medium",
  monoSemiBold: "RedHatMono_600SemiBold",
};

/** Styles de texte de la charte. */
export const typography = {
  title: { fontFamily: fontFamilies.display, fontSize: 24, lineHeight: 30 },
  heading: { fontFamily: fontFamilies.displaySemiBold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fontFamilies.text, fontSize: 16, lineHeight: 24 },
  bodyBold: { fontFamily: fontFamilies.textBold, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fontFamilies.textMedium, fontSize: 14, lineHeight: 20 },
  labelBold: { fontFamily: fontFamilies.textBold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fontFamilies.text, fontSize: 13, lineHeight: 18 },
  metricXl: { fontFamily: fontFamilies.monoSemiBold, fontSize: 40, lineHeight: 44 },
  metric: { fontFamily: fontFamilies.mono, fontSize: 22, lineHeight: 28 },
  value: { fontFamily: fontFamilies.mono, fontSize: 16, lineHeight: 24 },
} as const;

export const spacing = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 } as const;
export const radius = { sm: 6, md: 12, lg: 20 } as const;
export const sizes = { touchTarget: 48, icon: 24, iconSm: 20 } as const;
