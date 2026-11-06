# 05 · Charte graphique et maquettes

> Étape 3 de la conception (issues #1 et #2). La charte de référence est le design system **Parc Solaire** ; les maquettes sont sur le canevas **Maquettes Parc Solaire**. Ce document en résume le contenu pour le dépôt et pour le dossier.

| Ressource | Lien |
|---|---|
| Design system (couleurs, typographie, espacements, icônes, règles d'usage) | <https://claude.ai/artifact/Vzkustx3GJxvjEr2CFtZJ5> |
| Maquettes (23 planches : écrans, états, thème sombre) | <https://claude.ai/artifact/4YzFv6oVex6W2wyRfaf8DP> |

Les deux liens sont privés tant qu'ils ne sont pas partagés depuis le menu « Partager » de chaque page.

## 1. Principes

- **Lisible au soleil** : texte principal en `ink` sur `surface` ou `surface-raised`, jamais d'information en petit texte gris seul.
- **Un état ne se lit jamais à la couleur seule** : chaque couleur d'état est accompagnée de son icône et d'un mot.
- **Les valeurs d'abord** : la valeur utile est l'élément le plus grand de l'écran, avec son unité et son ancienneté.
- **L'écran Pilotage montre ce que fait l'objet**, pas seulement ce qui lui a été demandé.
- **Zones tactiles d'au moins 48 px**, pour un usage avec des gants.

## 2. Couleurs

Noms de jetons en anglais ([D012](../journal/decisions/D012-langue-du-code.md)). Thème clair et thème sombre ([D018](../journal/decisions/D018-palette-et-themes.md)).

| Jeton | Clair | Sombre | Usage |
|---|---|---|---|
| `surface` | `#f4f7f6` | `#0e161b` | Fond des écrans |
| `surface-raised` | `#ffffff` | `#162128` | Cartes, barre d'onglets, dialogues |
| `surface-sunken` | `#e7edeb` | `#0a1014` | Pistes de jauges, zones désactivées |
| `ink` | `#13202a` | `#e9eff2` | Texte principal et valeurs |
| `ink-muted` | `#475763` | `#a3b3bc` | Libellés, unités |
| `line` | `#d3dcdf` | `#26343c` | Séparateurs décoratifs |
| `line-strong` | `#66777f` | `#7d8f98` | Bordures des contrôles |
| `sun` | `#f2b705` | `#f5c431` | Marque, flux de production (aplats) |
| `sun-strong` | `#a87e00` | `#f5c431` | Courbe de production dans les graphiques |
| `on-sun` | `#13202a` | `#13202a` | Texte sur `sun` |
| `primary` | `#0b6e69` | `#43c4b6` | Action principale, flux vers la batterie |
| `on-primary` | `#ffffff` | `#06201e` | Texte sur `primary` |
| `grid` | `#2f5fd0` | `#86a8ff` | Flux vers le réseau |
| `status-normal` | `#1d7445` | `#58c98f` | État normal |
| `status-warning` | `#a84a07` | `#f5a04a` | Avertissement |
| `status-critical` | `#b3261e` | `#ff8a7a` | Critique, refus, hors ligne |
| `status-nodata` | `#5f6f78` | `#93a4ad` | Sans données |
| `status-*-soft` | voir le design system | | Fonds de bandeaux et pastilles |
| `focus` | `#2f5fd0` | `#86a8ff` | Anneau de focus |
| `disabled-fill`, `disabled-line` | `#c9d3d8`, `#93a4ad` | `#2a3740`, `#4c5c65` | Contrôles désactivés |
| `map-ground`, `map-field`, `map-path` | | | Fond de carte |
| `scrim` | 55 % d'encre | 60 % de noir | Voile derrière un dialogue |

### Contrastes vérifiés (WCAG 2)

Calculés sur les valeurs ci-dessus. Seuils : 4,5:1 pour le texte, 3:1 pour les bordures, icônes et éléments graphiques.

| Couple | Clair | Sombre |
|---|---|---|
| `ink` / `surface` | 15,4 | 15,7 |
| `ink-muted` / `surface` | 6,9 | 8,5 |
| `line-strong` / `surface-raised` | 4,7 | 4,9 |
| `on-primary` / `primary` | 6,1 | 8,0 |
| `on-sun` / `sun` | 9,1 | 10,1 |
| `status-normal` / `surface-raised` | 5,8 | 7,9 |
| `status-warning` / `surface-raised` | 5,8 | 7,8 |
| `status-critical` / `surface-raised` | 6,5 | 7,2 |
| `status-nodata` / `surface-raised` | 5,2 | 6,4 |
| `ink` / `status-critical-soft` | 13,3 | 13,6 |
| `focus` / `surface-raised` | 5,7 | 7,1 |

Seule exception : `sun` sur `surface` en thème clair (1,7:1). Cette couleur n'est donc jamais utilisée pour du texte, et tout graphique en `sun` est accompagné de sa valeur écrite.

**Fonds d'état clairs (`status-*-soft`) : toujours bordés.** Un fond `-soft` posé sur une carte se distingue à peine (1,15:1 entre `status-warning-soft` et `surface-raised`). Tout bandeau ou pastille sur fond `-soft` porte donc une bordure de 1 px dans sa couleur d'état, qui dépasse 3:1 dans les deux thèmes (`status-warning` : 5,8:1 en clair, 7,8:1 en sombre).

## 3. Typographie

[D016](../journal/decisions/D016-typographie-red-hat.md) : famille **Red Hat** (licence SIL Open Font), fichiers embarqués dans l'app.

| Style | Famille | Taille / interligne | Graisse | Usage |
|---|---|---|---|---|
| `title` | Red Hat Display | 24 / 30 | 700 | Titre d'écran |
| `heading` | Red Hat Display | 18 / 24 | 600 | Titre de carte |
| `body` | Red Hat Text | 16 / 24 | 400 | Texte courant |
| `label` | Red Hat Text | 14 / 20 | 500 | Libellés, boutons |
| `caption` | Red Hat Text | 13 / 18 | 400 | Ancienneté, mentions secondaires |
| `metric-xl` | Red Hat Mono | 40 / 44 | 600 | Valeur principale |
| `metric` | Red Hat Mono | 22 / 28 | 500 | Valeurs secondaires |

Les valeurs chiffrées sont en Red Hat Mono pour que les chiffres ne bougent pas quand ils changent. L'app respecte la taille de police choisie dans les réglages du téléphone.

## 4. Espacements, formes, icônes

- Espacements : 4, 8, 12, 16, 24, 32 px (`space-1` à `space-8`). Marges d'écran 16 px, écart entre cartes 16 à 24 px.
- Rayons : 6 px (pastilles, champs), 12 px (cartes, boutons), 20 px (dialogues, carte du parc).
- Pas d'ombre portée : les cartes se détachent par leur fond.
- Icônes : **Phosphor**, graisse « regular », 24 px ([D017](../journal/decisions/D017-icones-phosphor.md)). La correspondance usage → icône est dans le design system.

## 5. Format des textes

- Français, phrases courtes, sans point d'exclamation ni emoji.
- Nombres au format français : virgule décimale, espace insécable avant l'unité (« 3,15 kW », « 63 % »).
- Boutons : verbe à l'infinitif (« Appliquer ») ; résultat au participe (« Appliquée »).

## 6. Maquettes

Toutes les maquettes sont au format téléphone (390 × 844 px), en français, avec les données de démonstration du modèle de données.

| Rangée | Écrans |
|---|---|
| Écrans principaux | Supervision, Carte, Pilotage, Alertes, Détail d'un panneau, Connexion, Carte en vue Liste avec les panneaux à positionner ([D020](../journal/decisions/D020-inventaire-des-panneaux.md), réglage « placement » pour la feuille de positionnement) |
| Envoi d'une consigne | Confirmation, attente de l'objet, résultat (appliquée, appliquée en partie, refusée) |
| États particuliers | Téléphone hors ligne, objet hors ligne, rôle lecteur, chargement, aucune alerte, erreur de connexion |
| Thème sombre | Les six écrans principaux en thème sombre |
| Composant partagé | Barre d'onglets |

Sur le canevas, chaque écran a un réglage **Clair / Sombre** (onglet Tweaks). L'écran Pilotage a un réglage d'état qui affiche ses huit variantes ; Supervision, Alertes et Connexion ont aussi le leur. Les écrans principaux sont reliés entre eux : le mode Lecture permet de naviguer par la barre d'onglets.

Chaque élément affiché correspond à un champ de l'API (section 7.3 de la [cartographie technique](03-cartographie-technique.md)).

### Thème de l'app

L'app suit le réglage clair ou sombre du téléphone. Les couleurs sont définies une seule fois, à partir de `tokens.json`, dans `apps/mobile/src/theme/` (deux jeux de valeurs, mêmes noms de jetons).

## 7. Écarts et points ouverts

- Le design system ne contient pas encore de composants réutilisables (boutons, pastilles, cartes) : ils seront écrits directement en React Native à partir des jetons.
- Les maquettes n'ont pas encore été relues par le groupe (critère de l'issue #2).
