// Modèle de secrets.h (non versionné). Générer le vrai fichier avec « pnpm firmware:secrets »
// (voir firmware/site-device/README.md) ou copier ce modèle en secrets.h et le remplir.
// Ne jamais mettre de valeur réelle dans ce fichier.
#pragma once

// Réseau virtuel de Wokwi : point d'accès ouvert, sans mot de passe.
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

// Broker MQTT atteint par le tunnel bore : hôte (doit figurer dans MQTT_TLS_HOSTS) et port TLS distant.
#define MQTT_HOST "bore.pub"
#define MQTT_PORT 8883

// Identifiant de l'objet : le nom est fixé (device-site01). Plus de mot de passe : le broker
// exige un certificat client sur 8883 (D027), obtenu par enrôlement (#83).
#define MQTT_USERNAME "device-site01"
#define MQTT_PASSWORD ""

// Certificat de l'autorité du projet (infra/mosquitto/generated/ca.crt, public).
static const char MQTT_CA_CERT[] = R"EOF(
-----BEGIN CERTIFICATE-----
remplacer-par-le-contenu-de-ca.crt
-----END CERTIFICATE-----
)EOF";
