# D026 · Icônes Phosphor embarquées dans le code de l'app

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée · remplace [D017](D017-icones-phosphor.md) sur le mode d'intégration |
| **Décideurs** | À compléter |
| **Liens** | Issue #68 · [Cartographie, section 5.3](../../conception/03-cartographie-technique.md) · `apps/mobile/src/theme/icon-paths.ts` |

## Contexte

D017 retenait les icônes Phosphor (graisse « regular ») via le paquet `phosphor-react-native`. À l'intégration du thème (#68), l'installation de ce paquet a échoué à plusieurs reprises sous Windows (erreur `EPERM` pendant la copie de ses milliers de fichiers, dossier synchronisé par OneDrive), même avec une autre méthode d'import de pnpm. L'app n'utilise qu'une trentaine d'icônes.

## Options étudiées

| Critère | `phosphor-react-native` | Tracés générés depuis `@phosphor-icons/core`, dessinés avec `react-native-svg` |
|---|---|---|
| Installation sur les postes du binôme | Échoue sous OneDrive | Aucune dépendance ajoutée |
| Poids | Paquet complet (toutes les icônes) | Une trentaine de tracés |
| Fidélité à la charte | Phosphor regular | Identique (mêmes tracés, même grille 256) |
| Ajout d'une icône | Import direct | Ajouter son tracé au fichier généré |

## Décision

Les tracés des icônes utilisées sont extraits de `@phosphor-icons/core` (graisse « regular ») dans `src/theme/icon-paths.ts`, et dessinés par le composant `Icon` avec `react-native-svg`, déjà nécessaire au plan du parc et aux courbes. Le choix de Phosphor, de sa graisse et des icônes de la charte (D017) ne change pas.

## Conséquences

- Pas de dépendance `phosphor-react-native` ; `Icon` accepte uniquement les noms présents dans `icon-paths.ts` (vérifié par TypeScript).
- Une nouvelle icône demande d'ajouter son tracé, copié depuis `@phosphor-icons/core` (fichier `assets/regular/<nom>.svg`).
