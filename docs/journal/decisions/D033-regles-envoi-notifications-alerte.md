# D033 · Règles d'envoi des notifications d'alerte : aucune au premier plan, pas de push pour une consigne refusée

| | |
|---|---|
| **Date** | 2026-11-26 |
| **Statut** | Acceptée (validée par le binôme) |
| **Décideurs** | Le binôme |
| **Liens** | Issues [#49](https://github.com/SamuelLnds/proj-app-mobile-co/issues/49) et [#50](https://github.com/SamuelLnds/proj-app-mobile-co/issues/50) · Remet en cause en partie [D030](D030-notifications-push-expo-et-locales.md) · [UML, UC10 et séquence 4.5](../../conception/02-uml.md) · [Cartographie, section 5.7](../../conception/03-cartographie-technique.md) |

## Contexte

[D030](D030-notifications-push-expo-et-locales.md) combine le push Expo (app fermée) et des notifications locales (app ouverte), et notifie toute alerte `warning` ou `critical` qui s'ouvre. Les premiers essais sur téléphone ont montré deux défauts :

- des notifications **redondantes** quand l'exploitant est dans l'app : elle affiche déjà l'alerte (badge de l'onglet Alertes, écran Alertes) ;
- une notification pour un **refus de consigne** que l'exploitant vient de provoquer : l'écran Pilotage lui montre déjà le résultat.

## Options étudiées

| Critère | Notifier toujours | Rien au premier plan, pas de push pour `setpoint_rejected` (retenue) | Exclure `setpoint_rejected` pour son seul auteur | Ne rien changer |
|---|---|---|---|---|
| Redondance | Forte : l'information est répétée dans l'app | Nulle au premier plan ; nulle pour un refus de consigne | Nulle pour l'auteur, mais les autres exploitants au premier plan restent notifiés | Forte (état actuel) |
| Risque de manquer une alerte | Nul | Faible : l'alerte reste visible dans l'app ; seul le refus de consigne n'est plus poussé aux autres exploitants, et il est sans urgence | Nul pour les autres | Nul |
| Complexité | Faible, mais un code de déduplication à maintenir | Faible : une constante partagée, un gestionnaire d'affichage qui ne montre rien, du code supprimé | Élevée : connaître l'auteur de la consigne et la présence dans l'app de chaque téléphone | Faible, mais le même code de déduplication à maintenir |

## Décision

Aucune notification système quand l'app est au premier plan : les notifications locales sont **retirées**. Le push n'est plus envoyé pour l'alerte `setpoint_rejected` (elle reste créée et visible dans l'app) ; les autres alertes `warning` et `critical` notifient toujours.

## Justification

Au premier plan, l'alerte est déjà visible dans l'app : la notifier ajoute du bruit sans information. Le retrait des notifications locales supprime aussi la mémoire des alertes déjà notifiées, le gestionnaire de doublons et le code qui les alimentait. Un refus de consigne est la conséquence d'un geste de l'exploitant, qui voit le résultat sur l'écran Pilotage ; il est de gravité `warning`, sans urgence pour un autre exploitant, et il reste consultable dans l'app. Distinguer l'auteur de la consigne imposerait de connaître la présence de chaque téléphone dans l'app, pour un gain faible.

`setpoint_no_response` reste notifiée : elle est critique, et l'exploitant peut avoir quitté l'app pendant les 30 s d'attente.

## Conséquences

- Les notifications locales sont retirées : `alert-notifications.ts`, `showLocalNotification` et la mémoire des alertes notifiées (SQLite) disparaissent de l'app. Le gestionnaire `setNotificationHandler` ne montre rien : il ne s'applique qu'à une notification reçue app au premier plan.
- Le comportement hors premier plan ne change pas : app fermée ou en arrière-plan, le système affiche le push ; l'appui ouvre le panneau concerné ou l'écran Alertes.
- Les autres exploitants ne reçoivent pas de push pour un refus de consigne, mais l'alerte reste visible dans l'app.
- Nouvelle constante partagée `PUSH_EXCLUDED_ALERT_TYPES` (`@solar/contracts`) ; `notifyAlert` n'envoie rien pour ces types.
- Aucun nouveau build n'est nécessaire : le changement est en JavaScript.
- Documents mis à jour : modèle de données, étude de faisabilité, UML (UC10, séquence 4.5, règles d'alerte), cartographie technique, besoins fonctionnels (jalon M5, issues #49 et #50), `apps/mobile/README.md`.

## Sources

- [Expo : `setNotificationHandler`](https://docs.expo.dev/versions/latest/sdk/notifications/#setnotificationhandlerhandler)
- [D030](D030-notifications-push-expo-et-locales.md), pour le choix du push et des notifications locales
