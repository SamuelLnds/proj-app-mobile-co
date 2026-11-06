import {
  DEMO_SITE_BATTERY_CAPACITY_WH,
  DEMO_SITE_MAX_CHARGE_POWER_W,
  DEMO_SITE_PEAK_POWER_W,
  DEMO_SITE_PRODUCTION_FACTOR,
  DEFAULT_PANEL_RATED_POWER_W,
  type PanelSource,
  type User,
} from "@solar/contracts";

// Données d'exemple du parc de démonstration, cohérentes avec le seed de l'API
// (section 8 de docs/conception/01-modele-donnees.md).

/** Identifiant UUID déterministe (version 4, variante RFC) pour les données d'exemple. */
export const mockId = (group: number, index: number) =>
  `00000000-0000-4000-8${String(group).padStart(3, "0")}-${String(index).padStart(12, "0")}`;

export const SITE = {
  id: mockId(1, 1),
  code: "SITE01",
  name: "Parc solaire de démonstration",
  latitude: 47.25,
  longitude: -1.55,
  peakPowerW: DEMO_SITE_PEAK_POWER_W,
  batteryCapacityWh: DEMO_SITE_BATTERY_CAPACITY_WH,
  maxChargePowerW: DEMO_SITE_MAX_CHARGE_POWER_W,
  productionFactor: DEMO_SITE_PRODUCTION_FACTOR,
};

/** Comptes de démonstration ; mot de passe commun : `demo`. */
export const MOCK_PASSWORD = "demo";
export const USERS: User[] = [
  { id: mockId(2, 1), email: "operator@demo.local", name: "Exploitant démo", role: "operator" },
  { id: mockId(2, 2), email: "viewer@demo.local", name: "Lecteur démo", role: "viewer" },
];

export type MockPanel = {
  id: string;
  code: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  ratedPowerW: number;
  source: PanelSource;
};

const ROWS = ["A", "B", "C", "D"];
// Environ 10 m entre deux panneaux : 0,00009° de latitude, 0,000132° de longitude à 47° N.
const STEP_LAT = 0.00009;
const STEP_LNG = 0.000132;

/** 20 panneaux positionnés (4 rangées de 5) et P21, détecté mais pas encore positionné (D020). */
export const PANELS: MockPanel[] = [
  ...Array.from({ length: 20 }, (_, i) => {
    const row = Math.floor(i / 5);
    const n = i + 1;
    return {
      id: mockId(3, n),
      code: `P${String(n).padStart(2, "0")}`,
      name: `Rangée ${ROWS[row]}, panneau ${n}`,
      latitude: SITE.latitude + 0.0003 - row * STEP_LAT,
      longitude: SITE.longitude - 0.0003 + (i % 5) * STEP_LNG,
      ratedPowerW: DEFAULT_PANEL_RATED_POWER_W,
      source: "seed" as const,
    };
  }),
  {
    id: mockId(3, 21),
    code: "P21",
    name: "P21",
    latitude: null,
    longitude: null,
    ratedPowerW: DEFAULT_PANEL_RATED_POWER_W,
    source: "discovered",
  },
];

/** Panneaux en panne (production divisée par 5) et panneau sans donnée récente. */
export const FAULTY_PANEL_CODES = ["P07", "P12"];
export const SILENT_PANEL_CODE = "P18";
