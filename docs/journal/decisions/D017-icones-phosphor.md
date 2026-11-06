# D017 · Icônes : Phosphor, via la bibliothèque React Native

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | Issue #1 · [Charte graphique](../../conception/05-charte-graphique.md) |

## Contexte

L'app a besoin d'une vingtaine d'icônes cohérentes : onglets, flux d'énergie, batterie, états (normal, avertissement, critique, sans données). Elles accompagnent toujours la couleur des états (accessibilité).

## Options étudiées

| Critère | SVG Phosphor téléchargés à la main | `phosphor-react-native` | Material Icons (`@expo/vector-icons`) |
|---|---|---|---|
| Couverture des besoins (batterie par niveau, réseau, soleil, thermomètre) | Complète | Complète | Partielle |
| Mise à jour | Manuelle | Par Dependabot | Par Dependabot |
| Couleur et taille dynamiques | À gérer soi-même | Propriétés `color`, `size`, `weight` | Propriétés `color`, `size` |
| Poids dans l'app | Seulement les icônes utilisées | Seulement les icônes importées | Police complète |
| Licence | MIT | MIT | Apache 2.0 |

## Décision

**Phosphor**, graisse « regular », via le paquet **`phosphor-react-native`**.

## Justification

Même jeu d'icônes que des SVG téléchargés, sans fichiers à maintenir à la main : couleur et taille se règlent par propriétés, et les mises à jour passent par Dependabot.

## Conséquences

- Dépendance `phosphor-react-native` (qui s'appuie sur `react-native-svg`, déjà prévu pour les graphiques).
- La correspondance usage → icône est fixée dans le design system ; toute nouvelle icône y est ajoutée d'abord.
