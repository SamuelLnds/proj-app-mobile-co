// Constantes partagées (section 8 de docs/conception/03-cartographie-technique.md).
// Les valeurs propres au firmware sont recopiées dans firmware/site-device/include/config.h
// et doivent rester identiques.

/** Période de publication des mesures du site par l'objet (s). */
export const SITE_MEASUREMENT_PERIOD_S = 5;
/** Période de publication des mesures de chaque panneau par le simulateur (s). */
export const PANEL_MEASUREMENT_PERIOD_S = 10;
/** Délai sans réponse de l'objet avant qu'une consigne passe en `no_response` (s). */
export const SETPOINT_RESPONSE_TIMEOUT_S = 30;
/** Délai de silence de l'objet avant de le déclarer hors ligne (s). */
export const DEVICE_SILENCE_TIMEOUT_S = 60;
/** Délai sans mesure avant qu'un panneau soit en statut `no_data` (s). */
export const PANEL_NO_DATA_TIMEOUT_S = 60;
/** Écart maximal toléré entre l'horodatage d'un message et l'heure du serveur (s). */
export const MAX_CLOCK_DRIFT_S = 300;

/** Facteur d'accélération du temps pour la simulation de la batterie. */
export const BATTERY_TIME_FACTOR = 60;
/** Seuil de batterie pleine (%). */
export const BATTERY_FULL_PCT = 95;
/** Seuil de résolution de l'alerte de batterie pleine (%). */
export const BATTERY_FULL_RESOLVED_PCT = 90;
/** Seuil de batterie faible (%). */
export const BATTERY_LOW_PCT = 20;
/** Seuil de résolution de l'alerte de batterie faible (%). */
export const BATTERY_LOW_RESOLVED_PCT = 25;
/** Niveau visé par la charge en mode automatique (%). */
export const AUTOMATIC_CHARGE_TARGET_PCT = 80;

/** Température de surchauffe d'un panneau (°C). */
export const OVERHEATING_C = 75;
/** Température de résolution de l'alerte de surchauffe (°C). */
export const OVERHEATING_RESOLVED_C = 70;
/** Rapport production / production attendue sous lequel la production est jugée faible. */
export const LOW_PRODUCTION_RATIO = 0.7;
/** Rapport de résolution de l'alerte de production faible. */
export const LOW_PRODUCTION_RESOLVED_RATIO = 0.8;
/** Ensoleillement minimal pour évaluer l'alerte de production faible (W/m²). */
export const MIN_IRRADIANCE_FOR_ALERT_W_M2 = 100;
/** Durée pendant laquelle la production doit rester faible avant l'alerte (s). */
export const LOW_PRODUCTION_DURATION_S = 60;

/** Pas de la part de production envoyée vers la batterie (%). */
export const BATTERY_SHARE_STEP_PCT = 10;
/** Puissance par défaut d'un panneau détecté automatiquement (W). */
export const DEFAULT_PANEL_RATED_POWER_W = 200;
/** Nombre maximal de panneaux par site (limite de la création automatique). */
export const MAX_PANELS_PER_SITE = 200;

// Paramètres du site de démonstration (seed et objet).
/** Puissance crête du site de démonstration (W). */
export const DEMO_SITE_PEAK_POWER_W = 4000;
/** Capacité de la batterie du site de démonstration (Wh). */
export const DEMO_SITE_BATTERY_CAPACITY_WH = 10000;
/** Puissance maximale de charge du site de démonstration (W). */
export const DEMO_SITE_MAX_CHARGE_POWER_W = 3000;
/** Production attendue (W) par W/m² d'ensoleillement du site de démonstration. */
export const DEMO_SITE_PRODUCTION_FACTOR = 4.0;
