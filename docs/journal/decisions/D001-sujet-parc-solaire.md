# D001 · Sujet : supervision et pilotage d'un parc solaire

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée (validation par l'enseignant à confirmer) |
| **Décideurs** | À compléter |
| **Liens** | [Étude de faisabilité](../../etude-faisabilite-parc-solaire.md) |

## Contexte

Le module propose des exemples de métiers (station météo, suivi de plantes, domotique LED ou relais, présence par badge BLE), sans que la liste soit fermée. Le sujet doit couvrir les cinq gestes du module (lire une grandeur, l'afficher, alerter au seuil, synchroniser vers un back-end, démo live) et les sept chapitres de la carte.

## Options étudiées

Une grille de 30 sujets a été établie, notée sur quatre axes de 1 à 5 : conformité au module, richesse technique, faisabilité (simulable dans Wokwi, en temps limité), originalité. Extrait des sujets les mieux classés et des exemples du module :

| Sujet | Conformité | Technique | Faisabilité | Originalité | Total /20 |
|---|---|---|---|---|---|
| Pilotage carbone du logement | 4 | 5 | 4 | 5 | 18 |
| Îlots de chaleur urbains | 5 | 4 | 5 | 4 | 18 |
| **Parc solaire** | 4 | 5 | 4 | 4 | **17** |
| Surveillance de crues | 4 | 5 | 4 | 4 | 17 |
| Air des salles de classe | 5 | 4 | 5 | 3 | 17 |
| Irrigation par parcelles | 5 | 5 | 4 | 3 | 17 |
| Serre connectée (exemple du module) | 5 | 4 | 5 | 2 | 16 |
| Présence par badge BLE (exemple du module) | 5 | 5 | 3 | 3 | 16 |

Critères complémentaires vérifiés pour chaque sujet : présence d'un seuil d'alerte, d'une action retour vers l'objet, d'une dimension cartographique, d'une source de données réelles, d'un usage terrain.

## Décision

Le sujet retenu est la **supervision et le pilotage d'un petit parc solaire** équipé d'une batterie et raccordé au réseau.

## Justification

- Prolongement direct de la station météo (ensoleillement → production), donc dans l'esprit du module.
- Une carte qui a du sens (localiser les panneaux) et un volume de mesures qui justifie une base de séries temporelles.
- Une action retour naturelle vers l'objet (voir [D003](D003-pilotage-batterie-reseau.md)).
- Entièrement simulable dans Wokwi, sans matériel.
- Sujet porteur pour l'équipe, qui y voit aussi un terrain pour une visualisation 3D.

## Conséquences

- Le métier ne figure pas tel quel dans la liste du module : il est présenté comme une variante de « station météo ».
- Le modèle de production est volontairement simplifié (production attendue proportionnelle à l'ensoleillement).
- Le RGPD est moins central que pour un sujet de présence (peu de données personnelles).

## Sources

- Carte du module et relevé (`supports-cours/`)
- Grille de comparaison des 30 sujets (présentée en séance le 6 novembre 2026)
