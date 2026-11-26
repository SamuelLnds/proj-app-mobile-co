# App mobile

App Expo (React Native, Expo Router) de supervision et de pilotage du parc solaire. Voir `docs/conception/` pour la conception.

## Notifications d'alerte : configuration Firebase

Les alertes `warning` et `critical` arrivent app fermée par le **push Expo**, qui s'appuie sur Firebase Cloud Messaging (FCM) sur Android ([D030](../../docs/journal/decisions/D030-notifications-push-expo-et-locales.md)). Quand l'app est ouverte, elle affiche ses propres notifications locales. La configuration Firebase se fait **une seule fois**, par le développeur, et n'est jamais versionnée.

Sans cette configuration, l'app se construit et fonctionne : elle n'obtient simplement pas de jeton push et n'affiche que les notifications locales.

### Procédure

1. **Créer le projet Firebase.** Dans la [console Firebase](https://console.firebase.google.com), créer un projet, puis y ajouter une **app Android** avec le nom de paquet `fr.solar.mobile`.
2. **Télécharger `google-services.json`** (paramètres du projet, onglet « Général », app Android).
3. **Le déposer sur EAS** comme variable d'environnement de type fichier `GOOGLE_SERVICES_JSON`, depuis `apps/mobile` :

   ```sh
   eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment development --environment preview --environment production --visibility secret
   ```

   À confirmer avec `eas env:create --help` : la documentation d'Expo consultée ne détaille pas ces options. Le même dépôt est possible depuis expo.dev (projet, « Environment variables », type « File »). Pour un build local, il suffit de placer `google-services.json` dans `apps/mobile` : `app.config.ts` l'utilise s'il existe (fichier ignoré par Git).

4. **Créer la clé de compte de service FCM V1 et la déposer sur EAS.**
   - Console Firebase : « Paramètres du projet », « Comptes de service », « Générer une nouvelle clé privée » (fichier JSON, à ne jamais versionner).
   - Dans `apps/mobile` : `eas credentials`, puis `Android`, le profil de build, `Google Service Account`, « Manage your Google Service Account Key for Push Notifications (FCM V1) », « Set up a Google Service Account Key for Push Notifications (FCM V1) », « Upload a new service account key ».
   - Autre possibilité : page « Credentials » du projet sur expo.dev.
5. **Relancer un build de développement** (`eas build --profile development --platform android`), puis l'installer sur le téléphone : l'app déjà installée ne contient ni `expo-device` ni la configuration Firebase.

### Vérification

- `npx expo config --type public` fonctionne avec ou sans `google-services.json`.
- Après connexion sur le téléphone, une ligne apparaît dans la table `push_tokens` de la base.
- Une alerte `critical` (par exemple en coupant l'objet) arrive app fermée dans Solar.

Sources : [identifiants FCM](https://docs.expo.dev/push-notifications/fcm-credentials/) et [variables d'environnement EAS](https://docs.expo.dev/eas/environment-variables/).
