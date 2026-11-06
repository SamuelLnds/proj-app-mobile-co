# D018 · Palette accessible, thèmes clair et sombre

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | Issue #1 · [Charte graphique](../../conception/05-charte-graphique.md) |

## Contexte

L'app doit être lisible en plein soleil et de nuit, accessible (WCAG 2, niveau AA), et distinguer clairement trois flux d'énergie (production, batterie, réseau) et quatre états (normal, avertissement, critique, sans données). Le groupe a demandé un thème sombre en plus du thème clair.

## Options étudiées

**Palette**

| Critère | Couleurs par défaut de la plateforme | Palette « énergie » vive (jaune, vert, rouge) | Palette retenue : neutres bleutés, soleil en aplat, teal, bleu |
|---|---|---|---|
| Contraste du texte ≥ 4,5:1 | Variable | Jaune et vert clair échouent sur fond blanc | Vérifié pour chaque couple, dans les deux thèmes |
| Distinction des trois flux | Non prévue | Jaune / vert / rouge : confusion avec les états | Jaune (production), teal (batterie), bleu (réseau), différents des couleurs d'état |
| Daltonisme | Non traité | Vert / rouge indiscernables pour certains | Icône et mot obligatoires pour chaque état |

**Thème sombre**

| Critère | Thème clair seul | Inversion automatique | Second jeu de valeurs pour chaque jeton |
|---|---|---|---|
| Confort de nuit | Faible | Moyen | Bon |
| Contrastes maîtrisés | Oui | Non (couleurs d'accent illisibles) | Oui, vérifiés un par un |
| Coût de mise en œuvre | Nul | Faible | Faible si toutes les couleurs passent par des jetons |

## Décision

- Palette de la [charte](../../conception/05-charte-graphique.md), avec un **second jeu de valeurs sombres pour chaque jeton**.
- Toutes les couleurs de l'app passent par les jetons : aucune couleur écrite en dur dans un composant.
- L'app **suit le réglage clair ou sombre du téléphone**.

## Justification

Les contrastes sont garantis dans les deux thèmes, et le thème sombre ne coûte qu'un jeu de valeurs supplémentaire. La seule couleur qui échoue (le jaune soleil sur fond clair, 1,7:1) n'est jamais utilisée pour du texte et toujours accompagnée de la valeur écrite.

## Conséquences

- `apps/mobile/src/theme/` expose deux jeux de couleurs aux mêmes noms, sélectionnés selon le thème du téléphone.
- Toute nouvelle couleur est ajoutée au design system avec ses deux valeurs et son contraste vérifié.
- Les maquettes sont fournies dans les deux thèmes.
