# App mobile

App Expo (React Native, Expo Router) de supervision et de pilotage du parc solaire. Voir `docs/conception/` pour la conception.

## Notifications d'alerte : configuration Firebase

Les alertes `warning` et `critical` arrivent app fermée par le **push Expo**, qui s'appuie sur Firebase Cloud Messaging (FCM) sur Android ([D030](../../docs/journal/decisions/D030-notifications-push-expo-et-locales.md)). Quand l'app est ouverte, elle affiche ses propres notifications locales. La configuration Firebase se fait **une seule fois**, par le développeur, et n'est jamais versionnée.

Sans cette configuration, l'app se construit et fonctionne : elle n'obtient simplement pas de jeton push et n'affiche que les notifications locales.

Deux fichiers sont à fournir, pour deux usages différents :

| Fichier                         | Rôle                                                             | Où il va                                                                                       |
| ------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `google-services.json`          | Identifie l'app Android auprès de Firebase ; lu **au build**     | Variable fichier EAS `GOOGLE_SERVICES_JSON` (et, en local, `apps/mobile/google-services.json`) |
| Clé de compte de service (JSON) | Autorise **Expo** à envoyer des messages par FCM V1 ; **secret** | Identifiants EAS (`eas credentials`), puis suppression du disque                               |

Prérequis : un compte Google, `eas-cli` installé et connecté (`eas whoami` affiche le compte du projet, `samuellnds`). Toutes les commandes `eas` se lancent depuis `apps/mobile`. Les libellés des consoles Firebase et Google Cloud évoluent : en cas d'écart, suivre la documentation citée en bas de page.

### Étape 1 · Créer le projet Firebase et l'app Android

1. Ouvrir la [console Firebase](https://console.firebase.google.com) et se connecter avec le compte Google.
2. Cliquer sur le bouton de création d'un projet (« Create a project »), puis saisir un nom, par exemple `solar-parc`. Firebase en déduit un identifiant de projet, **non modifiable** après la création.
3. Si la console le demande, accepter les conditions, puis « Continue ». Une étape propose Google Analytics : **la désactiver** (inutile pour le push). Cliquer sur « Create project ».
4. Sur la page d'accueil du projet, cliquer sur l'icône **Android** (ou « Add app »).
5. Dans le champ « Android package name », saisir exactement `fr.solar.mobile` (sensible à la casse, non modifiable ensuite). Le surnom de l'app est facultatif.
6. **Laisser vide l'empreinte SHA-1** : la page d'enregistrement de la documentation Firebase ne la demande pas et la documentation d'Expo sur FCM V1 ne l'exige pas. Elle ne concerne que le cas d'une clé d'API Google **restreinte** à l'application (voir le dépannage).
7. Cliquer sur « Register app ».

Résultat attendu : l'app `fr.solar.mobile` apparaît dans la console, avec un bouton « Download google-services.json ».

### Étape 2 · `google-services.json` et variable fichier EAS

1. Cliquer sur « Download google-services.json ». Si l'étape 1 est déjà passée : « Project settings » (roue dentée), onglet « General », rubrique « Your apps », app Android, téléchargement du fichier.
2. Ranger le fichier sous le nom exact `apps/mobile/google-services.json` (sans suffixe `(1)`). Il est ignoré par Git : `git status` ne doit pas le lister. `app.config.ts` l'utilise pour un build local.
3. Liaison entre le profil `development` et les variables EAS : la propriété `environment` d'un profil de `eas.json` désigne l'environnement EAS (`development`, `preview` ou `production`) dont les variables sont injectées dans le build. Ce dépôt la fixe explicitement : le profil `development` utilise l'environnement `development`. Sans cette propriété, EAS choisit `development` quand `developmentClient` vaut `true`, `production` pour une distribution `store`, `preview` sinon.
4. Déposer le fichier sur EAS :

   ```sh
   eas env:set --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment development --environment preview --environment production --visibility secret
   ```

   `eas env:set` crée la variable ou la met à jour. L'ancienne commande `eas env:create` est marquée obsolète par `eas-cli`. Pour un seul environnement, ne garder qu'un `--environment`. Le même dépôt est possible dans le tableau de bord expo.dev (projet, « Environment variables »).

5. Vérifier :

   ```sh
   eas env:list --environment development
   ```

   Attendu : une variable `GOOGLE_SERVICES_JSON` dans l'environnement `development`. Sa valeur est masquée : la visibilité `secret` interdit toute relecture, c'est normal.

`google-services.json` n'est lu qu'au build. S'il change (autre projet Firebase), relancer la commande ci-dessus, qui remplace la valeur, puis refaire un build.

### Étape 3 · Clé de compte de service FCM V1 (secret)

Cette clé permet aux serveurs d'Expo d'envoyer un message à FCM pour votre projet. Sans elle, aucun push n'arrive, même avec un jeton valide.

1. Console Firebase, « Project settings » (roue dentée), onglet « Service accounts ».
2. Cliquer sur « Generate new private key », puis confirmer par « Generate key ». Un fichier JSON se télécharge.
3. **Ce fichier est un secret.** Ne jamais le placer dans le dépôt, ne jamais le coller dans une discussion ou une issue. Le ranger **hors du dépôt** (par exemple dans le dossier personnel) le temps du dépôt sur EAS.
4. Depuis `apps/mobile`, lancer `eas credentials`, puis choisir dans les menus :
   1. `Android`
   2. le profil de build : `development`
   3. `Google Service Account`
   4. `Manage your Google Service Account Key for Push Notifications (FCM V1)`
   5. `Set up a Google Service Account Key for Push Notifications (FCM V1)`
   6. `Upload a new service account key`
   7. Si le fichier se trouve dans le dossier du projet, `eas-cli` le détecte et demande confirmation (`Y`) ; sinon, indiquer son chemin.
5. Autre possibilité sans la ligne de commande : expo.dev, projet, « Project settings », « Credentials », Android, identifiant `fr.solar.mobile`, « Service credentials », « FCM V1 service account key », « Add a service account key », envoi du JSON puis « Save ».
6. **Supprimer le fichier JSON du disque** (ou le garder dans un gestionnaire de mots de passe) une fois le dépôt confirmé. Si le fichier a fuité, supprimer la clé dans la console Google Cloud (IAM et administration, comptes de service, onglet « Keys ») et en générer une autre.

Résultat attendu : en rouvrant le même menu d'`eas credentials`, une clé FCM V1 est listée.

### Étape 4 · Nouveau build de développement

L'app déjà installée ne contient ni `expo-device` ni la configuration Firebase : un nouveau build est obligatoire.

```sh
eas build --profile development --platform android
```

Attendu : le build se termine avec une URL de page de build et de téléchargement de l'APK.

Installer l'APK sur le téléphone, par l'un des deux moyens :

- ouvrir le lien (ou le code QR) de la page du build sur le téléphone ;
- ou, après téléchargement de l'APK, téléphone branché en mode débogage USB : `adb install -r chemin/vers/solar.apk` (`-r` remplace l'app existante en gardant ses données).

### Étape 5 · Vérification

1. Lancer la pile : `pnpm dev` (base, API, simulateur).
2. Sur le téléphone, ouvrir Solar, se connecter et **accepter** la demande d'autorisation des notifications (Android 13 et plus).
3. Vérifier l'enregistrement du jeton, sans l'afficher :

   ```sh
   docker exec infra-db-1 psql -U solar -d solar -c "select platform, created_at from push_tokens"
   ```

   Attendu : une ligne `android` avec la date du jour. Aucune ligne : voir le dépannage.

4. Test d'envoi direct : ouvrir l'[outil de notifications Expo](https://expo.dev/notifications), y saisir le jeton `ExponentPushToken[...]` (lu par `select token from push_tokens` ; ne pas le partager), un titre et un message, puis « Send a Notification ». App **fermée** (retirée des applications récentes), la notification doit apparaître.
5. Test de bout en bout : app fermée, arrêter le simulateur ; une fois l'alerte « objet hors ligne » ouverte, une notification « Alerte critique » doit arriver.

### Dépannage

| Symptôme                                                                                                | Cause probable                                                                                                                       | Correction                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aucune ligne dans `push_tokens`                                                                         | Le build ne contient pas `google-services.json` : variable absente de l'environnement `development`, ou ancien build encore installé | `eas env:list --environment development`, refaire l'étape 2, puis un nouveau build (étape 4)                                                                                                                                                                             |
| Aucune ligne, autorisation refusée                                                                      | Notifications refusées à la première demande                                                                                         | Réglages Android, Apps, Solar, Notifications : autoriser ; rouvrir l'app                                                                                                                                                                                                 |
| Aucune ligne, erreur `403 PERMISSION_DENIED: Requests from this Android client application are blocked` | Clé d'API Google de `google-services.json` restreinte                                                                                | Console Google Cloud, « APIs & Services », « Credentials » : autoriser « FCM Registration API » et « Firebase Installations API », ou ne pas restreindre la clé ; avec une restriction par application, y déclarer l'empreinte SHA-1 du certificat de signature de l'app |
| Erreur Expo `InvalidCredentials`                                                                        | Clé FCM V1 absente, ou issue d'un autre projet Firebase que `google-services.json`                                                   | Refaire l'étape 3 avec la clé du **même** projet que celui de l'étape 1                                                                                                                                                                                                  |
| `DeviceNotRegistered`                                                                                   | Jeton périmé : app désinstallée ou données effacées                                                                                  | L'API supprime le jeton ; se reconnecter dans l'app pour en obtenir un nouveau                                                                                                                                                                                           |
| Jeton enregistré, rien n'arrive (Xiaomi, MIUI ou HyperOS)                                               | Le système ferme l'app et bloque ses notifications                                                                                   | Réglages, Apps, Solar : activer « Démarrage automatique » ; « Économie de batterie » sur « Aucune restriction » ; autoriser les notifications ; verrouiller l'app dans les applications récentes. Les intitulés varient selon la version du système                      |

Le message d'erreur exact renvoyé par Expo figure dans le journal de l'API.

### Sources consultées

- [FCM V1 : identifiants pour le push Expo](https://docs.expo.dev/push-notifications/fcm-credentials/)
- [Configuration du push Expo](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [Variables d'environnement EAS](https://docs.expo.dev/eas/environment-variables/), [création et gestion](https://docs.expo.dev/eas/environment-variables/manage/) et [utilisation (choix de l'environnement par profil)](https://docs.expo.dev/eas/environment-variables/usage/)
- [`android.googleServicesFile`](https://docs.expo.dev/versions/latest/config/app/#googleservicesfile)
- [Firebase : configuration d'un projet Android](https://firebase.google.com/docs/android/setup)
- Options des commandes vérifiées avec `eas-cli` 27.5.0 : `eas env:set --help`, `eas env:create --help`, `eas env:list --help`, `eas credentials --help`.
