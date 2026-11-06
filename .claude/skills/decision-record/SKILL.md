---
name: decision-record
description: Rédiger une fiche de décision dans le journal du projet (docs/journal/decisions/) et l'ajouter à l'index, pour le dossier à rendre. À utiliser dès qu'un choix engage le projet - technologie, périmètre, architecture, format, organisation - ou qu'une décision existante est remise en cause.
---

# Rédiger une fiche de décision

## Quand

Une fiche est nécessaire dès qu'un choix :
- ajoute, remplace ou retire une technologie, une dépendance structurante ou un service externe ;
- change le périmètre (fonctionnalité ajoutée, retirée, passée en bonus) ;
- modifie l'architecture, un format d'échange ou le modèle de données de façon notable ;
- fixe une règle d'organisation du groupe.

Une correction mineure (renommage, coquille, valeur de détail) n'en a pas besoin.

## Comment

1. Prendre le numéro suivant dans l'index `docs/journal/README.md` (`D0xx`).
2. Copier `docs/journal/decisions/_modele.md` vers `docs/journal/decisions/D0xx-<sujet-court>.md`.
3. Remplir chaque rubrique :
   - **Contexte** : le problème et les contraintes, en quelques phrases.
   - **Options étudiées** : un tableau comparant **au moins deux options** sur des critères explicites (coût, complexité, adéquation au module, risques…).
   - **Décision** : l'option retenue en une ou deux phrases.
   - **Justification** : pourquoi elle l'emporte, au regard des critères.
   - **Conséquences** : ce que cela implique, documents et issues à modifier.
   - **Sources** : liens consultés, s'il y en a.
4. Statut : `Proposée` tant que le binôme n'a pas validé, `Acceptée` ensuite.
5. Ajouter la ligne dans l'index de `docs/journal/README.md`.
6. Citer la fiche dans les documents de conception modifiés (`[D0xx](../journal/decisions/D0xx-….md)`).

## Remise en cause d'une décision

Ne jamais supprimer ni réécrire une fiche acceptée. Créer une nouvelle fiche, passer l'ancienne au statut « Remplacée par D0yy » et ajouter une phrase qui renvoie vers la nouvelle.

## Style

Français, phrases courtes, pas d'estimation de durée. Les noms techniques (tables, routes, paquets) restent en anglais entre accents graves.
