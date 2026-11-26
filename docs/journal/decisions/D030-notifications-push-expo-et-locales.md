# D030 · Notifications : push Expo (Firebase) et notifications locales, à la place de ntfy

| | |
|---|---|
| **Date** | 2026-11-26 |
| **Statut** | Acceptée (validée par le binôme) |
| **Décideurs** | Le binôme |
| **Liens** | Issues [#49](https://github.com/SamuelLnds/proj-app-mobile-co/issues/49) et [#50](https://github.com/SamuelLnds/proj-app-mobile-co/issues/50) · Remplace [D029](D029-notifications-locales-et-ntfy.md) · Rétablit la partie notifications de [D005](D005-framework-mobile.md) · [Cartographie, sections 1, 2, 5, 7 et 9](../../conception/03-cartographie-technique.md) |

## Contexte

[D029](D029-notifications-locales-et-ntfy.md) avait écarté le push Expo pour ne dépendre d'aucun compte tiers, et mis en place un serveur ntfy auto-hébergé. À l'usage, la solution est lourde à déployer : l'alerte app fermée s'affiche dans une seconde app (ntfy) que l'utilisateur doit installer, puis configurer avec un serveur, un sujet et un jeton. Sa fiabilité dépend aussi du constructeur du téléphone : les services d'arrière-plan sont tués, notamment sur Xiaomi.

Contraintes : une alerte doit arriver app fermée, sans manipulation de l'utilisateur ; l'app de test est un *development build* ; la règle du projet interdit toute donnée personnelle dans une notification.

## Options étudiées

| Critère | Push Expo + Firebase | Solar connectée à ntfy (service Android) | ntfy + app ntfy | Tâche de fond (`expo-background-task`) | Notifications locales seules |
|---|---|---|---|---|---|
| Mise en place | Facile : configuration unique côté développeur (projet Firebase, `google-services.json`, clé FCM sur EAS) | Difficile : module natif Kotlin | Facile, mais procédure manuelle sur chaque téléphone | Moyenne | Facile |
| Batterie | Quasi nulle (canal système partagé) | Faible mais réelle (connexion permanente) | Idem, portée par l'app ntfy | Faible | Nulle |
| Friction utilisateur | Aucune | Faible (notification permanente, exemption de batterie) | Forte (seconde app, saisie manuelle) | Aucune | Aucune |
| Fiabilité app fermée | Très bonne, même en veille | Bonne avec l'exemption de batterie ; services tués par certains constructeurs | Idem | Mauvaise (au mieux toutes les 15 min) | Nulle |
| Délai | Quelques secondes | Quelques secondes | Quelques secondes | 15 min à plusieurs heures | Immédiat, app ouverte seulement |
| Notification dans Solar | Oui | Oui | Non | Oui | Oui |
| Dépendance à un tiers | Google (FCM) et Expo (relais) | Aucune | Aucune | Aucune | Aucune |
| Infrastructure | Rien de plus | Serveur ntfy | Serveur ntfy | Rien de plus | Rien de plus |
| Maintenance | Faible, chemin standard | Élevée, code natif | Faible côté code, mais support utilisateur | Faible | Nulle |

## Décision

Utiliser le **push Expo (FCM sur Android)** pour les alertes app fermée, combiné aux **notifications locales** de l'app pour l'affichage immédiat app ouverte. Le serveur ntfy est retiré.

## Justification

Le push Expo est la seule option fiable en veille qui n'impose ni friction à l'utilisateur ni coût de batterie notable, et c'est la moins coûteuse à mettre en place parmi les options fiables : une configuration unique par le développeur, puis un chemin standard et maintenu. Les notifications locales restent utiles : elles s'affichent sans attendre le relais d'Expo quand l'app est ouverte.

Risque assumé : le contenu transite par Expo et Google. C'est acceptable, car la règle du projet interdit déjà toute donnée personnelle dans une notification : seuls le texte de l'alerte et des identifiants techniques transitent.

## Conséquences

- Configuration Firebase unique, faite par le développeur : projet Firebase, `google-services.json` déposé sur EAS (variable fichier `GOOGLE_SERVICES_JSON`), clé de compte de service FCM V1 déposée sur EAS. Procédure dans `apps/mobile/README.md`.
- Un nouveau build de l'app est nécessaire (module natif `expo-notifications` et configuration Firebase) ; le code charge ces modules à la demande tant que l'app installée ne les embarque pas.
- Le service ntfy, son volume, son script de préparation et les variables `NTFY_URL`, `NTFY_TOPIC` et `NTFY_TOKEN` sont supprimés.
- Retour des jetons push : table `push_tokens` et enum `mobile_platform` recréés par une nouvelle migration, routes `POST /v1/push-tokens` et `DELETE /v1/push-tokens/{token}`, dépendance `expo-server-sdk`, variable facultative `EXPO_ACCESS_TOKEN`.
- Pas de doublon : quand l'app est au premier plan, un push dont l'alerte est déjà notifiée localement n'est pas affiché une seconde fois.
- Aucune donnée personnelle dans un message push : le texte de l'alerte et des identifiants techniques seulement (testé).
- Documents mis à jour : modèle de données, UML (acteur, UC01, UC02, UC10, séquences 4.1, 4.4 et 4.5), cartographie technique, besoins fonctionnels (issues #49, #50, #51 et #54), étude de faisabilité, `CLAUDE.md`.

## Sources

- [Expo : notifications push, identifiants FCM](https://docs.expo.dev/push-notifications/fcm-credentials/)
- [Expo : variables d'environnement EAS](https://docs.expo.dev/eas/environment-variables/)
- [D029](D029-notifications-locales-et-ntfy.md), pour la comparaison avec ntfy
