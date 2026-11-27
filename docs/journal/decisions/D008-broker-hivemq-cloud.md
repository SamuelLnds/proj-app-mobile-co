# D008 · Broker : HiveMQ Cloud

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Remplacée par [D023](D023-broker-mosquitto-auto-heberge.md) |
| **Décideurs** | À compléter |
| **Liens** | [Cartographie technique](../../conception/03-cartographie-technique.md), sections 1 et 6 |

> Remplacée par [D023](D023-broker-mosquitto-auto-heberge.md) le 6 novembre 2026 : HiveMQ n'accepte plus de nouveau cluster Serverless gratuit (fin de l'offre le 31 décembre 2026).

## Contexte

La carte du module propose Mosquitto, HiveMQ ou AWS. L'étude de Wokwi a montré une contrainte forte : en offre gratuite, l'ESP32 simulé passe par une passerelle publique qui **atteint Internet mais pas le poste du développeur**. La passerelle privée, qui permettrait de joindre un broker local, est réservée aux abonnements payants.

## Options étudiées

| Critère | Mosquitto local | Mosquitto hébergé | HiveMQ Cloud (offre gratuite) | AWS IoT Core | Wokwi payant + Mosquitto local |
|---|---|---|---|---|---|
| Joignable depuis Wokwi gratuit | Non | Oui | Oui | Oui | Oui |
| Coût | Gratuit | Serveur à payer ou à trouver | Gratuit | Gratuit au début, facturation à surveiller | ≈ 6 à 7 € par mois |
| TLS | À configurer | À configurer | Inclus | Inclus (certificats) | À configurer |
| Administration | Faible | Serveur à maintenir | Aucune | Complexe (IAM, politiques) | Faible |
| Apprentissage de la configuration du broker | Oui | Oui | Limité | Spécifique à AWS | Oui |

## Décision

**HiveMQ Cloud**, offre gratuite, en développement comme en démonstration.

## Justification

Seule option à la fois gratuite, joignable depuis Wokwi, sécurisée par TLS sans configuration, et sans serveur à administrer.

## Conséquences

- Le broker est un service externe : en cas d'indisponibilité, aucun message ne circule.
- Les droits fins par client dépendront de ce que permet l'offre gratuite (point ouvert).
- Le chapitre 3 (passerelles et brokers) sera traité en « souligné » : comprendre le fonctionnement de MQTT plutôt qu'administrer un broker.

## Sources

- <https://docs.wokwi.com/guides/esp32-wifi> (passerelle publique et privée)
- <https://wokwi.com/pricing>
- <https://www.hivemq.com/products/mqtt-cloud-broker/>
