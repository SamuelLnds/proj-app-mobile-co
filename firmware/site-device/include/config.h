// Constantes de l'objet du site.
// Les valeurs de la première partie sont recopiées de packages/contracts/src/constants.ts
// et doivent rester IDENTIQUES (un test de tools/simulator le vérifie).
#pragma once

#include <cstdint>

// --- Constantes partagées (section 8 de docs/conception/03-cartographie-technique.md) ---

// Version du format des messages MQTT.
constexpr int MESSAGE_VERSION = 1;
// Période de publication des mesures du site (s).
constexpr int SITE_MEASUREMENT_PERIOD_S = 5;
// Facteur d'accélération du temps pour la simulation de la batterie.
constexpr int BATTERY_TIME_FACTOR = 60;
// Seuils de la batterie (%) et pas de la part envoyée vers la batterie (%).
constexpr int BATTERY_FULL_PCT = 95;
constexpr int BATTERY_FULL_RESOLVED_PCT = 90;
constexpr int BATTERY_LOW_PCT = 20;
constexpr int BATTERY_LOW_RESOLVED_PCT = 25;
constexpr int AUTOMATIC_CHARGE_TARGET_PCT = 80;
constexpr int BATTERY_SHARE_STEP_PCT = 10;
// Paramètres du site de démonstration.
constexpr int DEMO_SITE_PEAK_POWER_W = 4000;
constexpr int DEMO_SITE_BATTERY_CAPACITY_WH = 10000;
constexpr int DEMO_SITE_MAX_CHARGE_POWER_W = 3000;
constexpr float DEMO_SITE_PRODUCTION_FACTOR = 4.0f;
// Période de suivi d'une demande d'enrôlement (s), D027.
constexpr int ENROLLMENT_POLL_PERIOD_S = 3;

// --- Propres au firmware ---

constexpr const char *FIRMWARE_VERSION = "0.1.0";
constexpr const char *SITE_CODE = "SITE01";
// Identifiant MQTT, aussi utilisé comme identifiant de client (section 6.3 de la cartographie).
constexpr const char *MQTT_DEVICE_ID = "device-site01";

// Niveau de la batterie simulée au démarrage de l'objet (%), comme le simulateur Node.
constexpr double INITIAL_BATTERY_LEVEL_PCT = 50.0;
// Période de l'algorithme de pilotage (ms) : batterie, flux, relais et barre de LED. La mesure part
// toutes les SITE_MEASUREMENT_PERIOD_S secondes.
constexpr unsigned long CONTROL_TICK_PERIOD_MS = 1000;
// Délai (ms) après une connexion MQTT avant de publier l'état en attente depuis le tick : laisse au broker
// le temps de renvoyer la consigne retained, pour ne pas publier un état initial que cette consigne
// remplacerait aussitôt.
constexpr unsigned long STATE_SETTLE_AFTER_CONNECT_MS = 1500;
// Taille du tampon MQTT (octets) : un paquet entrant ou sortant plus grand est ignoré par PubSubClient.
// Les messages de la section 6.2 font moins de 320 octets (MESSAGE_BUFFER_SIZE) ; une consigne, environ 130.
constexpr int MQTT_BUFFER_SIZE = 512;

// Bouton de panne : la production est divisée par ce facteur.
constexpr float FAULT_PRODUCTION_DIVISOR = 5.0f;

// Délais de reconnexion (ms), anti-rebond du bouton (ms) et attente de l'heure NTP (ms).
constexpr unsigned long RECONNECT_INTERVAL_MS = 5000;
constexpr unsigned long BUTTON_DEBOUNCE_MS = 40;
constexpr unsigned long NTP_TIMEOUT_MS = 20000;
// Maintien de la connexion MQTT (s) : le broker publie le Last Will au plus tard 1,5 fois ce délai
// après une coupure brutale (soit 90 s). Valeur large car Wokwi simule l'ESP32 plus lentement que le
// temps réel (environ 50 %, moins si le panneau du simulateur est caché) : avec 15 s, le PINGREQ
// arrivait trop tard et le broker coupait la session (« exceeded timeout »).
constexpr int MQTT_KEEPALIVE_S = 60;
// Délai d'attente d'une réponse du broker sur le socket (s) ; reste très inférieur au maintien ci-dessus.
constexpr int MQTT_SOCKET_TIMEOUT_S = 10;
// Resynchronisation NTP périodique (ms). Wokwi fait avancer l'horloge du firmware plus lentement que le
// temps réel : sans resynchronisation, les horodatages des mesures prennent un retard croissant
// (l'API les remplace au-delà de MAX_CLOCK_DRIFT_S). Minimum accepté par le SNTP de l'ESP-IDF : 15 s.
constexpr unsigned long NTP_RESYNC_INTERVAL_MS = 60000;

// Enrôlement (D027) : nouvel essai d'une demande refusée par l'API (autre demande en attente, API
// injoignable), contrôle du certificat une fois connecté (une révocation ne coupe pas la connexion),
// refus de connexion du broker avant de vérifier le certificat auprès de l'API, délai d'une requête HTTP.
constexpr unsigned long ENROLLMENT_RETRY_MS = 15000;
constexpr unsigned long CERTIFICATE_CHECK_PERIOD_MS = 30000;
constexpr int MQTT_FAILURES_BEFORE_CHECK = 3;
constexpr uint16_t ENROLLMENT_HTTP_TIMEOUT_MS = 8000;

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
