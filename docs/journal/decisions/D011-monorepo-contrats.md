# D011 · Monorepo pnpm et contrats Zod partagés

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | [Cartographie technique](../../conception/03-cartographie-technique.md), sections 3 et 5.1 |

## Contexte

L'app, l'API et le simulateur échangent les mêmes formats (messages MQTT, requêtes et réponses REST). Plusieurs personnes travaillent en parallèle sur ces briques.

## Options étudiées

| Critère | Un dépôt par application | Monorepo sans code partagé | Monorepo + paquet de contrats partagé |
|---|---|---|---|
| Risque de divergence des formats | Élevé | Élevé | Faible : un seul schéma |
| Changement de format | Plusieurs pull requests | Une pull request, formats recopiés | Une pull request, erreurs de compilation partout où c'est nécessaire |
| CI | Une par dépôt | Unique | Unique |
| Outillage | Simple | pnpm workspaces | pnpm workspaces |

Gestionnaire de paquets : pnpm (workspaces natifs, rapide) préféré à npm workspaces et Yarn ; Turborepo jugé inutile à cette taille.

## Décision

**Monorepo pnpm** avec `apps/mobile`, `apps/api`, `apps/simulator`, et un paquet **`packages/contracts`** contenant les schémas Zod, les énumérations, les constantes et la construction des topics.

## Justification

Un format modifié à un seul endroit casse la compilation partout où il est utilisé : les incohérences sont détectées avant l'exécution.

## Conséquences

- `contracts` ne contient aucune logique métier et ne dépend d'aucun autre paquet du dépôt.
- Le firmware (C++) ne peut pas importer ces schémas : il reproduit les formats documentés, et l'API valide ses messages.
