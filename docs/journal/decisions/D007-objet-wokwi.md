# D007 · Objet : un seul ESP32 simulé dans Wokwi

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | [Étude de faisabilité](../../etude-faisabilite-parc-solaire.md), section 6 |

## Contexte

La carte du module propose ESP32, Arduino ou Wokwi. Le livrable accepte « firmware ou simu ».

## Options étudiées

| Critère | ESP32 physique | Arduino physique | ESP32 simulé dans Wokwi |
|---|---|---|---|
| Coût | ≈ 5 € par carte + capteurs | Idem | Gratuit |
| WiFi intégré | Oui | Selon le modèle | Oui (réseau `Wokwi-GUEST`) |
| Capteurs nécessaires disponibles | À acheter | À acheter | Tous présents dans le catalogue Wokwi |
| Risque de panne matérielle pendant la démo | Oui | Oui | Non |
| Travail à plusieurs | Une carte par personne | Idem | Projet partageable |
| Limites | — | — | Une seule carte par projet ; réseau local injoignable en offre gratuite ; OTA, veille profonde et secure boot peu ou pas simulés |

**Nombre de boîtiers :** un boîtier par fonction (chaîne, météo, tracker) a été envisagé, puis écarté au profit d'**un seul ESP32** regroupant mesures et pilotage, complété par un **script qui simule 20 panneaux** pour la carte.

## Décision

**Un seul ESP32 simulé dans Wokwi** : photorésistance, potentiomètre, DS18B20, deux relais, barre de LED, bouton de panne.

## Justification

Aucun achat, aucun risque matériel, tous les composants disponibles, et les limites de Wokwi ne touchent que des fonctions retirées du socle.

## Conséquences

- Le broker doit être joignable depuis Internet ([D008](D008-broker-hivemq-cloud.md)).
- Les fonctions nécessitant du matériel réel (OTA, secure boot) restent hors socle.

## Sources

- <https://docs.wokwi.com/getting-started/supported-hardware>
- <https://docs.wokwi.com/guides/esp32-wifi>
