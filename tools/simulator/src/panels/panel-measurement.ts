// Calcul des mesures des panneaux : fonctions pures, sans entrée-sortie ni horloge ni aléa système.
// L'aléa et l'heure sont fournis par l'appelant, ce qui rend le calcul testable.
import {
  DEFAULT_PANEL_RATED_POWER_W,
  MESSAGE_VERSION,
  type PanelMeasurement,
} from "@solar/contracts";
import { PEAK_IRRADIANCE_W_M2, temperatureFor } from "../device/sun";

/** Nombre de panneaux du seed (codes P01 à P20), voir `infra/seed/demo-site.json` et D020. */
export const SEED_PANEL_COUNT = 20;
/** Variation aléatoire maximale de la production d'un panneau (± 5 %). */
export const PRODUCTION_NOISE_RATIO = 0.05;
/** Facteur de division de la production d'un panneau listé dans `FAULTY_PANELS`. */
export const FAULTY_PANEL_DIVISOR = 5;

/** Codes des panneaux du seed : `P01` à `P20`. */
export function seedPanelCodes(count: number = SEED_PANEL_COUNT): string[] {
  return Array.from({ length: count }, (_, index) => `P${String(index + 1).padStart(2, "0")}`);
}

/** Codes à publier : les panneaux du seed puis ceux de `EXTRA_PANELS`, sans doublon. */
export function panelCodesToPublish(extraPanels: readonly string[]): string[] {
  return [...new Set([...seedPanelCodes(), ...extraPanels])];
}

/** Arrondit à une décimale pour garder des messages lisibles. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export type PanelMeasurementInput = {
  /** Ensoleillement courant du site (W/m²). */
  irradiance: number;
  /** Panneau listé dans `FAULTY_PANELS` : production divisée par `FAULTY_PANEL_DIVISOR`. */
  faulty: boolean;
  /** Nombre aléatoire dans [0, 1[, converti en variation de ± `PRODUCTION_NOISE_RATIO`. */
  random: number;
  now: Date;
};

/**
 * Mesure d'un panneau : production proportionnelle à l'ensoleillement (puissance nominale
 * `DEFAULT_PANEL_RATED_POWER_W`, soit celle des panneaux du seed), avec une variation de ± 5 %.
 */
export function buildPanelMeasurement(input: PanelMeasurementInput): PanelMeasurement {
  const noise = 1 + (input.random * 2 - 1) * PRODUCTION_NOISE_RATIO;
  const expected = (input.irradiance * DEFAULT_PANEL_RATED_POWER_W) / PEAK_IRRADIANCE_W_M2;
  const production = (expected * noise) / (input.faulty ? FAULTY_PANEL_DIVISOR : 1);
  return {
    v: MESSAGE_VERSION,
    timestamp: input.now.toISOString(),
    production: Math.max(0, round1(production)),
    temperature: round1(temperatureFor(input.irradiance)),
  };
}
