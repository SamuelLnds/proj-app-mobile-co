# D029 · Notifications : notifications locales dans l'app et serveur ntfy auto-hébergé, à la place du push Expo/Firebase

| | |
|---|---|
| **Date** | 2026-11-26 |
| **Statut** | Acceptée |
| **Décideurs** | Le binôme |
| **Liens** | Issues [#49](https://github.com/SamuelLnds/proj-app-mobile-co/issues/49) et [#50](https://github.com/SamuelLnds/proj-app-mobile-co/issues/50) · PR #94 · Remplace en partie [D005](D005-framework-mobile.md) (notifications push) · [D023](D023-broker-mosquitto-auto-heberge.md) · [D028](D028-hebergement-vps.md) · [Cartographie, sections 1, 2, 8 et 9](../../conception/03-cartographie-technique.md) |

## Contexte

La notification d'une alerte `warning` ou `critical` est exigée (UC10, issues #49 et #50). La conception prévoyait le service de notifications push d'Expo avec `expo-server-sdk`. Sur Android, ce service passe par Firebase Cloud Messaging (FCM) : il impose un projet Firebase, donc un compte Google, et un fichier de configuration dans l'app. Le binôme refuse de dépendre d'un compte tiers pour une fonction aussi centrale, alors que le broker MQTT est déjà auto-hébergé ([D023](D023-broker-mosquitto-auto-heberge.md)).

Contraintes : une notification doit pouvoir arriver app fermée ; l'app de test est un *development build* dont le code natif est figé tant qu'on ne la reconstruit pas ; l'hébergement final est un VPS derrière Caddy ([D028](D028-hebergement-vps.md)).

## Options étudiées

| Critère | Push Expo / FCM | Notifications locales seules | ntfy auto-hébergé | UnifiedPush (ntfy comme distributeur) | Connexion permanente de l'app (WebSocket ou SSE, service de premier plan) |
|---|---|---|---|---|---|
| Compte tiers nécessaire | Oui : Firebase et Google (et Expo) | Non | Non : l'app Android ntfy n'a pas besoin de compte | Non | Non |
| Réception app fermée | Oui | Non : l'app doit tourner pour interroger l'API | Oui, par le service de premier plan de l'app ntfy | Oui | Oui, tant que le service tourne |
| Notification affichée dans | Solar | Solar | L'app ntfy (pas Solar) | Solar | Solar |
| Travail natif | Configuration FCM, `expo-notifications` | `expo-notifications` seulement | Aucun côté Solar : un appel HTTP depuis l'API | Module natif à écrire : pas de bibliothèque Expo maintenue | Service de premier plan Android à écrire et à maintenir |
| Batterie | Service Google partagé, négligeable | Aucune de plus | Environ 0 à 1 % sur 17 h (FAQ de ntfy) | Comparable à ntfy | À gérer par le projet, notification permanente en plus |
| Cohérence avec l'auto-hébergement (D023) | Non : dépend d'Expo et de Google | Oui | Oui : un service de plus dans le même Docker Compose | Oui, mais l'app ntfy reste nécessaire comme distributeur | Oui |

## Décision

Combiner **deux mécanismes** :

1. **Notifications locales.** L'app voit les nouvelles alertes `warning` et `critical` en interrogeant l'API (elle le fait déjà toutes les 5 s) et affiche elle-même une notification avec `expo-notifications`, sans jeton push.
2. **Serveur ntfy dans le Docker Compose.** L'API publie chaque alerte `warning` ou `critical` ouverte sur un sujet protégé par jeton d'accès. Le téléphone la reçoit app fermée, par l'app Android ntfy (sans compte) abonnée à ce sujet.

## Justification

- Aucune option avec FCM ne satisfait le refus du compte tiers. Les notifications locales seules ne couvrent pas l'app fermée, et c'est le cas qui compte pour une alerte.
- ntfy auto-hébergé fonctionne sans Firebase : la livraison instantanée repose sur un service de premier plan de l'app ntfy, pour un coût de batterie annoncé d'environ 0 à 1 % sur 17 h ([ntfy, application Android](https://docs.ntfy.sh/subscribe/phone/) et [FAQ](https://docs.ntfy.sh/faq/)).
- La démarche est courante : Uptime Kuma, Home Assistant, Healthchecks.io ou Netdata publient leurs alertes vers ntfy ([intégrations](https://docs.ntfy.sh/integrations/), [Home Assistant](https://www.home-assistant.io/integrations/ntfy/)). Home Assistant Companion applique aussi, pour son mode « Local Push », le modèle d'une application qui affiche elle-même la notification, sans FCM ([notifications locales](https://companion.home-assistant.io/docs/notifications/notification-local)).
- Côté API, l'envoi se réduit à une requête HTTP : plus de table de jetons, plus de route, plus de dépendance à un SDK.
- UnifiedPush est écarté **pour l'instant** : il n'existe pas de bibliothèque Expo maintenue, il faudrait écrire un module natif ([UnifiedPush, applications](https://unifiedpush.org/users/apps/)). Il reste une piste si le projet doit un jour afficher la notification dans Solar. La connexion permanente de l'app demande un service de premier plan écrit par le projet, pour un résultat équivalent à celui de l'app ntfy.
- Le module natif `expo-notifications` est chargé à la demande : tant que l'app installée ne l'embarque pas, les notifications locales sont désactivées en silence et le reste de l'app fonctionne.

## Conséquences

- La notification reçue app fermée s'affiche dans l'app ntfy et non dans Solar ; l'appui ouvre la liste des alertes ou le panneau par un lien `solar://`.
- L'app ntfy garde une notification permanente sur le téléphone (service de premier plan) ; l'optimisation de batterie doit être retirée pour cette app.
- Le serveur ntfy doit être joignable depuis le téléphone : même Wi-Fi ou `adb reverse` en développement ; sur le VPS, il passera derrière Caddy en HTTPS, avec la même règle que l'API ([D028](D028-hebergement-vps.md)). En développement, le port est publié sur `127.0.0.1` uniquement, comme celui de Mosquitto.
- Jamais le serveur public ntfy.sh : un sujet y est lisible par quiconque en connaît le nom. Le serveur du projet refuse tout accès par défaut (`auth-default-access: deny-all`) ; l'API publie avec un jeton en écriture seule, le téléphone lit avec un jeton en lecture seule.
- Aucune donnée personnelle dans un message ntfy : le texte de l'alerte et des identifiants techniques seulement.
- Le push Expo et les jetons push sont retirés : module `notifications` de l'API réécrit, table `push_tokens` et enum `mobile_platform` supprimés par une nouvelle migration, routes `POST /v1/push-tokens` et `DELETE /v1/push-tokens/{token}` retirées, dépendances `expo-server-sdk` et `expo-device` retirées, variable `EXPO_ACCESS_TOKEN` remplacée par `NTFY_URL`, `NTFY_TOPIC` et `NTFY_TOKEN`.
- Documents mis à jour : modèle de données, UML (acteur, UC01, UC02, UC10, séquences 4.1, 4.4 et 4.5), cartographie technique, besoins fonctionnels (issues #49 et #50), étude de faisabilité, `CLAUDE.md`.
- Limite connue : le projet vise Android. Sur iOS, la réception instantanée d'un serveur ntfy auto-hébergé passe par un relais d'Apple et du serveur public ntfy.sh, ce que le projet s'interdit ([D005](D005-framework-mobile.md)).

## Sources

- [ntfy : application Android](https://docs.ntfy.sh/subscribe/phone/) et [FAQ](https://docs.ntfy.sh/faq/)
- [ntfy : intégrations](https://docs.ntfy.sh/integrations/)
- [Home Assistant : intégration ntfy](https://www.home-assistant.io/integrations/ntfy/)
- [Home Assistant Companion : notifications locales](https://companion.home-assistant.io/docs/notifications/notification-local)
- [UnifiedPush : applications](https://unifiedpush.org/users/apps/)
