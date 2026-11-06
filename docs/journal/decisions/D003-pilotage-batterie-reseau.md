# D003 · Pilotage par répartition batterie / réseau plutôt que par tracker

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | [Étude de faisabilité](../../etude-faisabilite-parc-solaire.md), section 4 · [UML, algorithme de pilotage](../../conception/02-uml.md) |

## Contexte

Retour reçu sur la première version du sujet : le suivi des données et la cartographie ne suffisent pas. Il faut un **vrai pilotage** pour privilégier la communication bidirectionnelle entre l'app et l'objet. Deux pistes ont été suggérées.

## Options étudiées

| Critère | Rotation automatique des panneaux (tracker) | Répartition batterie / réseau à distance |
|---|---|---|
| Pilotage **à distance** | Faible : l'orientation automatique est une boucle locale sur l'ESP32 | Fort : l'utilisateur décide depuis l'app |
| Communication bidirectionnelle | Moyenne | Forte : consigne descendante, état appliqué et refus éventuels en retour |
| Logique métier | Comparer deux photorésistances, bouger un servo | Niveau de batterie, limites de sécurité, bilan énergétique |
| Simulation Wokwi | Servo, 2 photorésistances, MPU6050 | 2 relais, barre de LED, batterie calculée par le firmware |
| Lisibilité de la démo | Visuelle | Visuelle et compréhensible : un curseur dans l'app change les flux dans Wokwi |
| Charge supplémentaire | ≈ 10 h | ≈ 10 à 12 h |

## Décision

Le pilotage du socle est la **répartition de la production entre la batterie et le réseau**, en mode manuel ou automatique, avec des limites de sécurité appliquées par l'objet. La rotation des panneaux devient un bonus.

## Justification

C'est l'option qui répond le mieux au retour : la décision est prise dans l'app, l'objet l'applique, la refuse si nécessaire, et renvoie ce qu'il fait réellement.

## Conséquences

- Nouvel écran « Pilotage » dans l'app, nouvelle table `setpoints`, nouveaux topics `setpoint` et `state`.
- L'objet gagne deux relais et une barre de LED ; la batterie est simulée par le firmware.
- Charge du socle portée de ≈ 60 h à ≈ 70 h.

## Sources

- Retour de l'enseignant sur le sujet (6 novembre 2026)
