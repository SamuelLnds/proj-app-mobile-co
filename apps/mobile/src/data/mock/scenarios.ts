/** Scénarios de démonstration de la source `mock` (variable EXPO_PUBLIC_MOCK_SCENARIO). */
export const MOCK_SCENARIOS = [
  { value: "normal", label: "Fonctionnement normal" },
  { value: "device_offline", label: "Objet du site hors ligne" },
  { value: "battery_full", label: "Batterie pleine" },
  { value: "no_alerts", label: "Aucune alerte" },
  { value: "phone_offline", label: "Téléphone hors ligne" },
] as const;

export type MockScenario = (typeof MOCK_SCENARIOS)[number]["value"];

export function parseScenario(value: string | undefined): MockScenario {
  return MOCK_SCENARIOS.some((s) => s.value === value) ? (value as MockScenario) : "normal";
}
