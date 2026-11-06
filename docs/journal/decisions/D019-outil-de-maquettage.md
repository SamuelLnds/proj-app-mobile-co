# D019 · Outil de maquettage : design system et canevas intégrés à Claude

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | Issues #1 et #2 · [Charte graphique](../../conception/05-charte-graphique.md) |

## Contexte

Il faut une charte (couleurs, typographie, icônes) et des maquettes des six écrans avec leurs états, partageables avec le groupe et réutilisables pour le développement.

## Options étudiées

| Critère | Figma | Maquettes dessinées dans un document | Design system + canevas intégrés à Claude |
|---|---|---|---|
| Charte réutilisable (jetons) | Oui (variables) | Non | Oui (`tokens.json` exportable) |
| Maquettes interactives | Oui (prototype) | Non | Oui (liens entre écrans, réglages d'état et de thème) |
| Lien avec le code | Export manuel | Aucun | Jetons au format JSON, repris tels quels dans l'app |
| Temps de production | Élevé | Moyen | Faible, l'assistant produit les écrans à partir de la conception |
| Partage avec le groupe | Compte Figma | Fichier | Lien, après partage depuis la page |

## Décision

La charte est un **design system** et les maquettes un **canevas de design**, tous deux créés avec les outils intégrés à Claude.

## Justification

Les jetons de couleur, de typographie et d'espacement sont la même source pour les maquettes et pour l'app. Les maquettes couvrent tous les états demandés par l'issue #2 sans multiplier les fichiers.

## Conséquences

- Liens dans la [charte graphique](../../conception/05-charte-graphique.md). Les pages doivent être partagées avec le groupe depuis leur menu « Partager ».
- Toute évolution de la charte se fait d'abord dans le design system, puis est reportée dans `apps/mobile/src/theme/`.
