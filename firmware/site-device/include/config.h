// Constantes de l'objet du site.
// Les valeurs de la première partie sont recopiées de packages/contracts/src/constants.ts
// et doivent rester IDENTIQUES (un test de tools/simulator le vérifie).
#pragma once

// --- Constantes partagées (section 8 de docs/conception/03-cartographie-technique.md) ---

// Version du format des messages MQTT.
constexpr int MESSAGE_VERSION = 1;
// Période de publication des mesures du site (s).
constexpr int SITE_MEASUREMENT_PERIOD_S = 5;
// Facteur d'accélération du temps pour la simulation de la batterie (utilisé par #38).
constexpr int BATTERY_TIME_FACTOR = 60;
// Seuils de la batterie (%), utilisés par #38 et #39.
constexpr int BATTERY_FULL_PCT = 95;
constexpr int BATTERY_FULL_RESOLVED_PCT = 90;
constexpr int BATTERY_LOW_PCT = 20;
constexpr int BATTERY_LOW_RESOLVED_PCT = 25;
constexpr int AUTOMATIC_CHARGE_TARGET_PCT = 80;
// Paramètres du site de démonstration.
constexpr int DEMO_SITE_PEAK_POWER_W = 4000;
constexpr int DEMO_SITE_BATTERY_CAPACITY_WH = 10000;
constexpr int DEMO_SITE_MAX_CHARGE_POWER_W = 3000;
constexpr float DEMO_SITE_PRODUCTION_FACTOR = 4.0f;

// --- Propres au firmware ---

constexpr const char *FIRMWARE_VERSION = "0.1.0";
constexpr const char *SITE_CODE = "SITE01";
// Identifiant MQTT, aussi utilisé comme identifiant de client (section 6.3 de la cartographie).
constexpr const char *MQTT_DEVICE_ID = "device-site01";

// Valeurs fixes en attendant la batterie simulée (#38).
constexpr float FIXED_BATTERY_LEVEL_PCT = 50.0f;
constexpr float FIXED_BATTERY_POWER_W = 0.0f;
constexpr const char *FIXED_MODE = "automatic";

// Bouton de panne : la production est divisée par ce facteur.
constexpr float FAULT_PRODUCTION_DIVISOR = 5.0f;

// Délais de reconnexion (ms), anti-rebond du bouton (ms) et attente de l'heure NTP (ms).
constexpr unsigned long RECONNECT_INTERVAL_MS = 5000;
constexpr unsigned long BUTTON_DEBOUNCE_MS = 40;
constexpr unsigned long NTP_TIMEOUT_MS = 20000;
// Maintien de la connexion MQTT (s) : le broker publie le Last Will après environ 1,5 fois ce délai.
constexpr int MQTT_KEEPALIVE_S = 15;

// Étalonnage de la photorésistance (module Wokwi : LDR en série avec 10 kΩ, rl10 = 50 kΩ, gamma = 0,7).
constexpr float ADC_MAX_RAW = 4095.0f;
constexpr float ADC_REFERENCE_V = 3.3f;
constexpr float LDR_SERIES_OHM = 10000.0f;
constexpr float LDR_RL10_OHM = 50000.0f;
constexpr float LDR_GAMMA = 0.7f;
// Éclairement (lux) correspondant à 1 W/m² : plein soleil, environ 100 000 lux, vaut environ 1 000 W/m².
constexpr float LUX_PER_W_M2 = 100.0f;
// Borne haute de l'ensoleillement publié (W/m²), celle du schéma SiteMeasurement.
constexpr float IRRADIANCE_MAX_W_M2 = 1500.0f;
