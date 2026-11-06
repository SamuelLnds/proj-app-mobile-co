# D005 · Framework mobile : Expo / React Native

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | [Cartographie technique](../../conception/03-cartographie-technique.md), section 4 |

## Contexte

La carte du module propose trois frameworks : Flutter, React Native ou Kotlin Multiplatform. Les prérequis du module incluent « un framework JS déjà vu ».

## Options étudiées

| Critère | Flutter | React Native (Expo) | Kotlin Multiplatform |
|---|---|---|---|
| Langage | Dart (nouveau pour le groupe) | TypeScript (déjà connu) | Kotlin (nouveau pour le groupe) |
| Partage de code avec l'API | Non | Oui (schémas Zod communs) | Non |
| Build et distribution | Outils Flutter | EAS Build (APK sans Android Studio) | Gradle, Xcode |
| Notifications push | Firebase à configurer | Service Expo intégré | Firebase à configurer |
| Carte, graphiques, 3D | Bibliothèques disponibles | `react-native-maps`, graphiques SVG, React Three Fiber | Moins de bibliothèques prêtes |
| Mises à jour à distance | Non natif | EAS Update | Non natif |

## Décision

**React Native avec Expo**, en TypeScript, navigation par Expo Router.

## Justification

Le langage est déjà maîtrisé, le même TypeScript sert à l'API et aux schémas partagés, et Expo réduit fortement le temps passé sur le build, la distribution et les notifications.

## Conséquences

- Un *development build* est nécessaire dès le départ : les notifications push ne fonctionnent plus dans Expo Go sur Android.
- Distribution de l'APK par EAS ; iOS seulement si un membre dispose d'un compte Apple Developer.
