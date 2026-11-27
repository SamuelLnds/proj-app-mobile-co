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

// API d'enrôlement (D027) : l'objet y demande son certificat client, sans mot de passe. En
// développement, l'API locale exposée par un second tunnel bore (bore local 3000 --to bore.pub) ;
// sur le VPS, son adresse HTTPS (définir alors ENROLLMENT_CA_CERT avec la racine publique de son
// certificat).
#define ENROLLMENT_URL "http://bore.pub:6801/v1"

// Certificat de l'autorité du projet (infra/mosquitto/generated/ca.crt, public).
static const char MQTT_CA_CERT[] = R"EOF(
-----BEGIN CERTIFICATE-----
remplacer-par-le-contenu-de-ca.crt
-----END CERTIFICATE-----
)EOF";
