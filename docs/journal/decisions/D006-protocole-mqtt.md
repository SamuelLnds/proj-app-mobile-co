# D006 · Protocole objet : MQTT 3.1.1

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | [Cartographie technique](../../conception/03-cartographie-technique.md), section 6 |

## Contexte

La carte du module propose BLE ou MQTT comme protocole du fil rouge. Pour MQTT, deux versions existent : 3.1.1 et 5.

## Options étudiées

| Critère | BLE | MQTT 3.1.1 | MQTT 5 |
|---|---|---|---|
| Portée | Quelques mètres | Internet | Internet |
| Adapté à un parc de plusieurs hectares | Non | Oui | Oui |
| Simulable dans Wokwi | Non (BLE non simulé) | Oui | Oui |
| Messages conservés (retained), Last Will, QoS 1 | — | Oui | Oui |
| Expiration de message, propriétés utilisateur | — | Non | Oui |
| Prise en charge par la bibliothèque ESP32 (PubSubClient) | — | Oui | Non |

## Décision

**MQTT 3.1.1**, sur TLS.

## Justification

MQTT est le seul choix compatible avec un parc et avec Wokwi. La version 3.1.1 apporte tout ce dont le socle a besoin (retained pour les consignes, Last Will pour la présence de l'objet, QoS 1 pour les commandes), et elle est prise en charge par la bibliothèque standard de l'ESP32.

## Conséquences

Pas d'expiration native des consignes ni de propriétés utilisateur ; ce n'est pas nécessaire dans le socle.
