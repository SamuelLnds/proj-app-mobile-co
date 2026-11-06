# D016 · Typographie : famille Red Hat

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | Issue #1 · [Charte graphique](../../conception/05-charte-graphique.md) |

## Contexte

L'app est lue en extérieur, souvent en plein soleil, et affiche beaucoup de valeurs chiffrées qui changent toutes les quelques secondes. La police doit être très lisible, gratuite et embarquable dans l'app.

## Options étudiées

| Critère | Polices système (Roboto, San Francisco) | Inter | Red Hat (Display, Text, Mono) |
|---|---|---|---|
| Lisibilité en petite taille | Bonne | Très bonne | Très bonne (Red Hat Text est dessinée pour le texte courant) |
| Chiffres à chasse fixe pour les valeurs | Selon la plateforme | Option `tnum` | Oui, avec Red Hat Mono, de la même famille |
| Cohérence titres / texte / chiffres | Variable selon Android et iOS | Une seule famille | Trois déclinaisons d'une même famille |
| Licence | Système | SIL Open Font | SIL Open Font |
| Identité propre au projet | Faible | Très répandue | Distinctive |

## Décision

**Red Hat Display** pour les titres, **Red Hat Text** pour le texte, **Red Hat Mono** pour les valeurs chiffrées. Fichiers embarqués dans l'app avec `expo-font`.

## Justification

Une seule famille couvre les trois usages. La déclinaison Mono évite que les chiffres « sautent » quand une valeur change, ce qui compte sur un écran rafraîchi en continu.

## Conséquences

- Les fichiers de police (licence SIL Open Font) sont ajoutés dans `apps/mobile/assets/fonts/`.
- Les tailles minimales sont fixées dans la charte (texte courant 16 px).
