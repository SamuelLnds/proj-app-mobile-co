// WiFi, heure NTP et MQTT sur TLS : connexion et reconnexions automatiques.
#pragma once

#include <cstddef>
#include <cstdint>

namespace network {

// Taille de l'emplacement qui reçoit une consigne (octet nul final compris).
constexpr size_t SETPOINT_SLOT_SIZE = 384;

// Lance la connexion WiFi et prépare le client MQTT (non bloquant).
void begin();

// À appeler à chaque tour de loop() : surveille le WiFi, l'heure, la session MQTT et traite les messages.
void loop();

bool isMqttConnected();

// Durée (ms) depuis la dernière connexion MQTT réussie ; 0 si la session est fermée.
unsigned long mqttConnectedForMs();

// Heure UTC en secondes depuis 1970 ; 0 tant que l'heure NTP n'est pas synchronisée.
int64_t epochSeconds();

// Publie sur solar/{SITE_CODE}/{subtopic}. PubSubClient ne sait publier qu'en QoS 0 : `state` et `status`
// sont donc publiés en retained QoS 0 (la conception demande QoS 1 pour `state`).
bool publish(const char *subtopic, const char *payload, bool retained);

// Récupère la consigne reçue sur solar/{SITE_CODE}/setpoint depuis le dernier appel, s'il y en a une
// (copiée dans `out`, terminée par un zéro, `length` octets). Le rappel de PubSubClient ne fait que la
// copier : l'analyse et la publication de l'état se font dans loop(), hors du rappel.
bool takeSetpoint(char *out, size_t size, size_t &length);

}  // namespace network
