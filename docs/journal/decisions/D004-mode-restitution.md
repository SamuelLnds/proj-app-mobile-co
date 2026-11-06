# D004 · Ajout du mode « restitution »

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | [UML, algorithme de pilotage](../../conception/02-uml.md), section 7 |

## Contexte

La première version du pilotage prévoyait deux modes (manuel, automatique) et une limite de sécurité « pas d'injection de l'énergie stockée sous 20 % ». Or aucun des deux modes ne décharge la batterie vers le réseau : la limite des 20 % ne s'appliquait jamais.

## Options étudiées

| Critère | Supprimer la limite des 20 % | Ajouter un mode « restitution » | Modéliser une consommation locale du site |
|---|---|---|---|
| Cohérence du modèle | Oui | Oui | Oui |
| Intérêt du pilotage | Inchangé | Plus riche : vider la batterie pendant une pointe | Plus riche, mais plus complexe |
| Complexité ajoutée | Aucune | Faible (quelques lignes dans le firmware, une valeur d'énumération) | Moyenne (nouveau flux, nouveau capteur) |
| Démonstration | Pas de cas « batterie faible » | Cas « batterie faible » démontrable | Démontrable |

## Décision

Ajout d'un troisième mode, **restitution** : la batterie se décharge vers le réseau à la puissance maximale, jusqu'à 20 %.

## Justification

Coût faible, et le pilotage gagne un scénario de plus (refus pour batterie faible), ce qui renforce la démonstration de la communication bidirectionnelle.

## Conséquences

- Enum `control_mode` : `manual`, `automatic`, `discharge` (restitution).
- Raison de refus `battery_low`.
- Étude de faisabilité et documents de conception mis à jour.
