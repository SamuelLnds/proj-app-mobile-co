# D025 · Intégration de l'interface sur données d'exemple, couche de données remplaçable

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | Milestone « Intégration de l'interface » (#68 à #76) · [Cartographie, section 5.3](../../conception/03-cartographie-technique.md) |

## Contexte

Les écrans de l'app étaient prévus dans les milestones fonctionnelles (Supervision, Pilotage, Alertes), construits en même temps que leur branchement à l'API. L'app ne pouvait donc avancer qu'après l'API, et le binôme ne pouvait pas travailler en parallèle. Aucune issue ne couvrait non plus le thème de l'app.

## Options étudiées

**Organisation**

| Critère | Écrans construits avec leur branchement | Milestone d'intégration sur données d'exemple, puis branchement |
|---|---|---|
| Dépendance à l'API | Forte | Aucune pour l'interface |
| Travail en parallèle du binôme | Faible | Fort : l'un sur l'interface, l'autre sur l'API et le simulateur |
| Vérification des maquettes (tous les états, deux thèmes) | Dispersée | Regroupée, démontrable tôt sur le téléphone |
| Risque de double travail | — | Faible si les données d'exemple ont les types de l'API |

**Source des données**

| Critère | Données en dur dans les écrans | Interface `DataSource` avec une source `mock` puis une source `api` |
|---|---|---|
| Remplacement par l'API | Réécrire chaque écran | Écrire une implémentation et changer une variable |
| Typage | Libre | Imposé par `@solar/contracts` |
| Démonstration sans serveur | Possible | Possible, avec scénarios et pilotage simulé |

**Carte et graphiques**

| Critère | `react-native-maps` et une bibliothèque de graphiques | Plan du parc et courbes dessinés avec `react-native-svg` |
|---|---|---|
| Clé d'API Google Maps sur Android | Nécessaire | Aucune |
| Fidélité à la maquette (plan stylisé du parc) | Faible | Forte |
| Fonctionnement hors ligne | Fonds de carte en ligne | Complet |
| Dépendances natives | Deux | Une (`react-native-svg`, déjà requise par les icônes) |

## Décision

- Nouvelle milestone **« Intégration de l'interface »** : thème, composants, couche de données et chaque écran avec tous ses états, sur données d'exemple. Les issues d'écran des autres milestones deviennent des issues de **branchement**.
- **Couche `src/data/`** : interface `DataSource` typée par `@solar/contracts`, source `mock` (données vivantes, scénarios, pilotage simulé selon la section 7 de l'UML), source choisie par `EXPO_PUBLIC_DATA_SOURCE`. Les écrans n'utilisent que les hooks TanStack Query de `src/api/`.
- **Carte en plan du parc** dessiné à partir des latitudes et longitudes des panneaux, et **courbes** dessinées avec `react-native-svg`, à la place de `react-native-maps` et `react-native-gifted-charts`.

## Justification

L'interface devient démontrable sans serveur, le binôme peut travailler en parallèle, et le branchement à l'API se limite à une implémentation de `DataSource`. Le plan dessiné colle à la maquette, évite une clé Google et fonctionne hors ligne.

## Conséquences

- Issues #25, #26, #28, #34 à #37, #45, #46, #50 et #62 réécrites en issues de branchement.
- Cartographie mise à jour (dépendances de l'app, dossier `src/data/`).
- Les données d'exemple doivent rester valides pour les schémas Zod : un test le vérifie.
- `react-native-svg` est une dépendance native : un nouveau development build est nécessaire.
