# D024 · Le simulateur joue l'objet du site ; connexion de Wokwi repoussée au firmware

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | Issues #64 et #65 · [D023](D023-broker-mosquitto-auto-heberge.md) · [UML, section 7](../../conception/02-uml.md) |

## Contexte

L'ESP32 est le seul émetteur des mesures du site, de son statut (Last Will compris) et de l'état appliqué, et le seul destinataire des consignes. Sans lui, la supervision, les alertes sur le site, la carte (le simulateur des panneaux dépend de l'ensoleillement du site) et tout le pilotage ne peuvent pas être testés de bout en bout. Or relier l'ESP32 de Wokwi au broker auto-hébergé demande un tunnel ou un abonnement ([D023](D023-broker-mosquitto-auto-heberge.md)).

## Options étudiées

| Critère | Attendre le firmware et la connexion de Wokwi | Publier les messages à la main (`mosquitto_pub`, tests) | Mode « objet du site » dans le simulateur |
|---|---|---|---|
| L'API et l'app avancent sans l'ESP32 | Non | Oui, mais fastidieux pour le pilotage | Oui |
| Démonstration de bout en bout possible tôt | Non | Partielle | Oui |
| Algorithme de pilotage | Écrit une fois (C++) | — | Écrit deux fois (TypeScript et C++) |
| Vérification du firmware | Manuelle | — | Comparaison avec une implémentation de référence testée |

## Décision

- Le simulateur reçoit un **mode « objet du site »** (`SIMULATE_DEVICE=true`) : mesures du site toutes les 5 s, statut et Last Will, application des consignes avec l'algorithme de la section 7 de l'UML et publication de l'état appliqué. Nouvelle issue, avant le pilotage.
- La **connexion de l'ESP32 de Wokwi au broker** (tunnel TCP ou passerelle privée) devient une issue à part, préalable au firmware.

## Justification

L'API, l'app et le pilotage avancent immédiatement, en local, sans dépendre d'un tunnel. L'algorithme en TypeScript, couvert par les tests reprenant le tableau de la section 7, sert de référence pour vérifier le firmware.

## Conséquences

- L'algorithme existe en double : toute modification de la section 7 de l'UML s'applique au simulateur et au firmware, avec leurs tests.
- Un seul émetteur à la fois pour le site : ne pas lancer le mode objet du site quand l'ESP32 de Wokwi est connecté.
- L'ESP32 de Wokwi reste indispensable pour le livrable (« firmware ou simu ») et la démonstration.
