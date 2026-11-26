// WiFi, heure NTP et MQTT sur TLS : connexion et reconnexions automatiques.
#pragma once

#include <cstdint>

namespace network {

// Lance la connexion WiFi et prépare le client MQTT (non bloquant).
void begin();

// À appeler à chaque tour de loop() : surveille le WiFi, l'heure, la session MQTT et traite les messages.
void loop();

bool isMqttConnected();

// Heure UTC en secondes depuis 1970 ; 0 tant que l'heure NTP n'est pas synchronisée.
int64_t epochSeconds();

// Publie sur solar/{SITE_CODE}/{subtopic}. PubSubClient ne sait publier qu'en QoS 0.
bool publish(const char *subtopic, const char *payload, bool retained);

}  // namespace network
