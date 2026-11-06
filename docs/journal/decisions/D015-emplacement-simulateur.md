# D015 · Le simulateur de panneaux est placé dans `tools/`

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | [Cartographie technique](../../conception/03-cartographie-technique.md), section 3 · complète [D011](D011-monorepo-contrats.md) |

## Contexte

La décision [D011](D011-monorepo-contrats.md) plaçait le simulateur des 20 panneaux dans `apps/simulator`, à côté de l'app mobile et de l'API. Or le simulateur n'est ni utilisé par l'utilisateur final ni déployé : il remplace des panneaux réels pour le développement et la démonstration.

## Options étudiées

| Critère | `apps/simulator` | `tools/simulator` | `firmware/` (avec l'objet simulé) |
|---|---|---|---|
| Convention des monorepos | `apps/` = programmes exécutables | `tools/` = outillage de développement | `firmware/` = code embarqué C++ |
| Distingue ce qui est livré de ce qui ne l'est pas | Non | Oui | Oui, mais mélange TypeScript et C++ |
| Traitement en CI | Comme l'app et l'API (risque de le construire ou de le déployer) | Tests seulement | Chaîne PlatformIO, inadaptée |
| Lisibilité pour le dossier | Moyenne | Bonne | Faible |

## Décision

Le simulateur est placé dans **`tools/simulator`**. Le dossier `apps/` ne contient que ce qui est livré : `apps/mobile` et `apps/api`.

## Justification

La structure du dépôt montre immédiatement ce qui fait partie du produit et ce qui sert seulement au développement et à la démonstration. La CI peut tester le simulateur sans jamais le construire ni le déployer.

## Conséquences

- `pnpm-workspace.yaml` inclura `apps/*`, `packages/*` et `tools/*` (étape 5).
- Les autres règles de D011 restent valables : le simulateur dépend de `packages/contracts` et n'importe aucune application.
- D'autres outils de développement éventuels (scripts de seed autonomes, générateurs de données) iront aussi dans `tools/`.
