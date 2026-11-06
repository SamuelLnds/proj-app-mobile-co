---
name: mobile-screen
description: Créer ou modifier un écran de l'app Expo (apps/mobile) conforme aux maquettes et à la charte - Expo Router, jetons de thème clair et sombre, TanStack Query et SQLite, accessibilité, états de chargement, d'erreur et hors ligne. À utiliser pour tout écran ou composant de l'app.
---

# Créer ou modifier un écran mobile

## Avant de coder

1. Ouvrir la maquette de l'écran et de **tous ses états** (lien dans `docs/conception/05-charte-graphique.md`) : chargement, erreur, sans réseau, rôle `viewer`, objet hors ligne, thème sombre.
2. Repérer les routes de l'API utilisées et les objets renvoyés (section 7.3 de `03-cartographie-technique.md`).
3. Repérer le fichier de l'écran dans la section 5.3 de la cartographie (`app/(tabs)/…`).

## Structure

- Écran : `app/…` (Expo Router). Il assemble des composants et des hooks, sans logique réseau directe.
- Données : un hook par ressource dans `src/api/` (TanStack Query). Chaque réponse est enregistrée dans SQLite (`src/storage/`) ; l'écran affiche d'abord la donnée locale, avec son ancienneté.
- Composants réutilisables : `src/components/`, nommés en `PascalCase`.
- Rafraîchissement : 5 s tant que l'écran est visible ; 2 s pendant l'attente d'une réponse à une consigne (60 s au plus).

## Style

- **Jamais de couleur écrite en dur** : uniquement les jetons de `src/theme/` (mêmes noms que la charte : `surface`, `ink`, `primary`, `status-warning`…). Les deux thèmes doivent fonctionner ; l'app suit le réglage du téléphone.
- Typographie : styles `title`, `heading`, `body`, `label`, `caption`, `metric-xl`, `metric` du thème ; valeurs chiffrées en Red Hat Mono.
- Icônes : `phosphor-react-native`, graisse « regular », 24 px (20 px dans les pastilles), selon le tableau de la charte.
- Un fond d'état clair (`status-*-soft`) est toujours bordé de sa couleur d'état.
- Nombres au format français : `3,15 kW`, `63 %`, espace insécable avant l'unité.

## Accessibilité (obligatoire)

- Zones tactiles d'au moins 48 × 48 px.
- `accessibilityLabel` sur tout élément interactif sans texte visible ; `accessibilityRole` adapté (`button`, `link`, `header`).
- Aucun état indiqué par la couleur seule : icône et mot.
- Respect de la taille de police du téléphone : aucune hauteur fixe sur un bloc de texte.
- Graphiques : un résumé textuel accessible (valeur actuelle, maximum).

## Textes

- En français, phrases courtes, sans point d'exclamation ni emoji.
- Messages d'erreur : ce qui s'est passé, puis quoi faire.
- Reprendre exactement les libellés des maquettes.

## Tests

- Test de rendu des composants principaux (Jest + React Native Testing Library), en interrogeant par rôle et par libellé (`getByRole`, `getByLabelText`).
- Vérifier sur le téléphone de test : thème clair, thème sombre, mode avion.
