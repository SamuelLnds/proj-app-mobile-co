// Courbe de journée accélérée : ensoleillement et température en fonction de l'heure simulée.
// Fonctions pures, sans horloge ni aléa.
import { BATTERY_TIME_FACTOR, DEMO_SITE_PRODUCTION_FACTOR } from "@solar/contracts";

/** Heure simulée de départ (h) : le soleil est déjà levé au lancement de la démo. */
export const START_HOUR = 9;
/** Lever et coucher du soleil simulés (h). */
const SUNRISE_HOUR = 6;
const SUNSET_HOUR = 20;
/** Ensoleillement au zénith (W/m²). */
export const PEAK_IRRADIANCE_W_M2 = 1000;
/** Température ambiante de nuit (°C) et échauffement au zénith (°C). */
const NIGHT_TEMPERATURE_C = 15;
const SUN_WARMING_C = 25;

const SECONDS_PER_DAY = 86_400;

/** Heure simulée (0 à 24, en heures) après `elapsedS` secondes réelles, au facteur d'accélération du site. */
export function simulatedHour(elapsedS: number, startHour: number = START_HOUR): number {
  const seconds = startHour * 3600 + elapsedS * BATTERY_TIME_FACTOR;
  return (seconds % SECONDS_PER_DAY) / 3600;
}

/** Ensoleillement (W/m²) à une heure simulée : arche de sinus entre le lever et le coucher, nul la nuit. */
export function irradianceAt(hour: number): number {
  if (hour <= SUNRISE_HOUR || hour >= SUNSET_HOUR) return 0;
  const ratio = (hour - SUNRISE_HOUR) / (SUNSET_HOUR - SUNRISE_HOUR);
  return PEAK_IRRADIANCE_W_M2 * Math.sin(Math.PI * ratio);
}

/** Production du site (W), proportionnelle à l'ensoleillement (paramètre du site de démonstration). */
export function productionFor(irradiance: number): number {
  return irradiance * DEMO_SITE_PRODUCTION_FACTOR;
}

/** Température (°C) : ambiante la nuit, plus élevée avec l'ensoleillement. */
export function temperatureFor(irradiance: number): number {
  return NIGHT_TEMPERATURE_C + SUN_WARMING_C * (irradiance / PEAK_IRRADIANCE_W_M2);
}
