# Parc solaire : supervision et pilotage

Application mobile de supervision et de pilotage d'un petit parc solaire (module « Applications mobiles et connectées », M2 DFS).

- Un **ESP32 simulé dans Wokwi** mesure l'ensoleillement, la production et la température du site, pilote une batterie simulée (deux relais, une barre de LED) et publie ses mesures en **MQTT sur TLS**.
- Un **simulateur Node** joue les 20 panneaux du parc (et, au choix, l'objet du site à la place de Wokwi).
- Un broker **Mosquitto** auto-hébergé (Docker) relaie les messages à une **API Fastify**, qui enregistre tout dans **PostgreSQL + TimescaleDB**, détecte les anomalies (alertes) et envoie les consignes.
- Une **app Expo (React Native)** affiche les données par l'API REST, envoie les consignes (répartition de la production entre batterie et réseau) et reçoit les alertes par push (Expo et Firebase) quand elle est fermée.

```
  ESP32 (Wokwi) --MQTT TLS 8883--> tunnel bore --+
                                                 v
  Simulateur Node --MQTT 1883--------------> Mosquitto <--MQTT 1883--> API Fastify <--SQL--> PostgreSQL
  (20 panneaux, objet optionnel)             (Docker)                  (port 3000)          + TimescaleDB
                                                                         ^   |
                                                       REST + JWT (/v1)  |   | push (expo-server-sdk)
                                                                         |   v
                                              App Expo <---------------+   Service Expo --> Firebase (FCM) --> téléphone
                                              (SQLite local)
```

Les documents de conception **font foi sur le code** (voir la [carte des documents](#10-carte-des-documents)). Pour présenter le projet à l'oral : [`docs/synthese-projet.md`](docs/synthese-projet.md).

## Table des matières

1. [Prérequis](#1-prérequis)
2. [Premier lancement](#2-premier-lancement)
3. [Lancer le développement](#3-lancer-le-développement)
4. [Build de développement de l'app et notifications push](#4-build-de-développement-de-lapp-et-notifications-push)
5. [Firmware et Wokwi](#5-firmware-et-wokwi)
6. [Vérifications](#6-vérifications)
7. [Workflow Git](#7-workflow-git)
8. [Problèmes connus et solutions](#8-problèmes-connus-et-solutions)
9. [État d'avancement et suite](#9-état-davancement-et-suite)
10. [Carte des documents](#10-carte-des-documents)

Les commandes sont données pour **Windows / PowerShell**, depuis la racine du dépôt sauf indication contraire.

## 1. Prérequis

| Outil                                          | Version                                                                  | Pourquoi                                                                                                                   | Vérifier                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Git**                                        | récente (2.44 chez le binôme)                                            | Versionner le code, travailler par branches                                                                                | `git --version`                                                     |
| **GitHub CLI (`gh`)**                          | récente (2.x)                                                            | Ouvrir les pull requests, lire les issues et milestones                                                                    | `gh --version` puis `gh auth login` et `gh auth status`             |
| **Node.js**                                    | **22** (fichier `.nvmrc` ; `engines` : `>=22.13.0`)                      | Exécute l'API, le simulateur, les outils et Metro. Installer par [nvm-windows](https://github.com/coreybutler/nvm-windows) | `node -v` (doit afficher `v22.x`)                                   |
| **pnpm**                                       | **10.34.9** (champ `packageManager` du `package.json`, via **corepack**) | Gère le monorepo (workspaces) ; corepack installe exactement la version fixée                                              | `corepack enable` (console administrateur si nécessaire), `pnpm -v` |
| **Docker Desktop**                             | récente (29 chez le binôme)                                              | Fait tourner la base (TimescaleDB) et le broker Mosquitto ; sert aussi à `pnpm mqtt:setup` (OpenSSL, `mosquitto_passwd`)   | `docker --version` et `docker ps` (Docker Desktop doit être lancé)  |
| **Python**                                     | 3.10 ou plus (3.10 chez le binôme)                                       | Support de PlatformIO                                                                                                      | `python --version`                                                  |
| **PlatformIO Core**                            | 6.x (6.2.0 chez le binôme)                                               | Compile le firmware de l'ESP32 (`firmware/site-device`)                                                                    | `pip install platformio` puis `python -m platformio --version`      |
| **VS Code** + extension **Wokwi**              | VS Code récent                                                           | Simule l'ESP32 et ses composants ; l'extension lit `firmware/site-device/wokwi.toml`                                       | Extension « Wokwi Simulator » installée, licence activée (voir §5)  |
| **bore** (`bore-cli`)                          | 0.6.0                                                                    | Tunnel TCP gratuit : l'ESP32 de Wokwi (dans le cloud) ne peut pas joindre le PC, bore expose le port TLS du broker         | `bore --version`                                                    |
| **Android** : téléphone + `adb`                | `adb` (platform-tools) récent                                            | Installer le build de développement, rediriger les ports par USB                                                           | `adb --version`, `adb devices` (le téléphone doit être listé)       |
| **Compte Expo** + **`eas-cli`**                | `eas-cli` 27.x                                                           | Construit l'APK de développement dans le cloud (EAS Build) sans Android Studio                                             | `npm install -g eas-cli`, `eas login`, `eas whoami`                 |
| **Compte Google** (console **Firebase**)       | n/a                                                                      | Nécessaire au push Android (FCM) ; facultatif si l'on renonce aux notifications                                            | Voir §4                                                             |
| Client MQTT (`mosquitto_sub`, `mosquitto_pub`) | facultatif                                                               | Observer les messages du broker pendant les tests firmware                                                                 | `mosquitto_sub --help`                                              |

Téléphone Android : activer les **options pour les développeurs**, puis le **débogage USB**. Sur Xiaomi (MIUI ou HyperOS), activer aussi **« Installer via USB »**, sinon l'installation échoue avec `INSTALL_FAILED_USER_RESTRICTED`.

Point à vérifier : l'emplacement exact de `adb` sur votre poste (il doit être dans le `PATH`).

## 2. Premier lancement

### 2.1 Récupérer le code et installer

```powershell
git clone https://github.com/SamuelLnds/proj-app-mobile-co.git
cd proj-app-mobile-co
git checkout develop
corepack enable
pnpm install
```

Le dépôt peut se trouver dans un dossier OneDrive, mais ne placez **jamais** de secret (clés, `google-services.json`, clé de compte de service) dans le dépôt ni dans OneDrive.

### 2.2 Créer les fichiers `.env`

Les fichiers `.env` ne sont jamais versionnés (seuls les `.env.example` le sont). Choisissez des mots de passe **longs et aléatoires**, par exemple :

```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

```powershell
Copy-Item infra/.env.example infra/.env
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item tools/simulator/.env.example tools/simulator/.env
Copy-Item apps/mobile/.env.example apps/mobile/.env
```

Variables à remplir, fichier par fichier. **Les mots de passe doivent se correspondre d'un fichier à l'autre.** `pnpm mqtt:setup` refuse la valeur `change-me`.

| Fichier                | Variable                                                                                   | À mettre                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infra/.env`           | `POSTGRES_USER`, `POSTGRES_DB`                                                             | Laisser `solar`                                                                                                                                                                                                                                                                                                             |
|                        | `POSTGRES_PASSWORD`                                                                        | Un mot de passe (repris dans `DATABASE_URL` de l'API)                                                                                                                                                                                                                                                                       |
|                        | `DB_PORT`                                                                                  | `5432` (mettre `5433` si un PostgreSQL local occupe déjà 5432, et le reporter dans `DATABASE_URL`)                                                                                                                                                                                                                          |
|                        | `MQTT_API_PASSWORD`                                                                        | Mot de passe du client MQTT `api` (repris dans `MQTT_PASSWORD` de l'API)                                                                                                                                                                                                                                                    |
|                        | `MQTT_SIMULATOR_PASSWORD`                                                                  | Mot de passe du client `simulator` (repris dans `MQTT_PASSWORD` du simulateur)                                                                                                                                                                                                                                              |
|                        | `MQTT_TLS_HOSTS`                                                                           | `localhost,bore.pub` (noms valables dans le certificat TLS du broker ; `bore.pub` est nécessaire pour Wokwi)                                                                                                                                                                                                                |
|                        | `MQTT_PORT`, `MQTTS_PORT`                                                                  | `1883` et `8883`                                                                                                                                                                                                                                                                                                            |
| `apps/api/.env`        | `DATABASE_URL`                                                                             | `postgres://solar:<POSTGRES_PASSWORD>@localhost:<DB_PORT>/solar`                                                                                                                                                                                                                                                            |
|                        | `JWT_SECRET`                                                                               | Au moins 32 caractères aléatoires                                                                                                                                                                                                                                                                                           |
|                        | `MQTT_URL`                                                                                 | `mqtt://127.0.0.1:1883` (`127.0.0.1` et non `localhost`, qui désigne d'abord `::1` sous Windows)                                                                                                                                                                                                                            |
|                        | `MQTT_USERNAME` / `MQTT_PASSWORD`                                                          | `api` / la valeur de `MQTT_API_PASSWORD`                                                                                                                                                                                                                                                                                    |
|                        | `SEED_OPERATOR_PASSWORD`, `SEED_VIEWER_PASSWORD`                                           | Mots de passe des comptes de démonstration (8 caractères au moins)                                                                                                                                                                                                                                                          |
|                        | `EXPO_ACCESS_TOKEN`                                                                        | Facultatif (jeton du compte Expo, renforce l'envoi des push) ; laisser vide sinon                                                                                                                                                                                                                                           |
|                        | `NODE_ENV`, `PORT`, `LOG_LEVEL`                                                            | `development`, `3000`, `info`                                                                                                                                                                                                                                                                                               |
|                        | `DEVICE_CA_CERT_PATH`, `DEVICE_CA_KEY_PATH`, `BROKER_DEVICES_DIR`, `BROKER_RELOAD_COMMAND` | Laisser vides : valeurs par défaut du développement (autorité des objets de `pnpm mqtt:setup`, rechargement du broker par Docker, [D035](docs/journal/decisions/D035-signature-des-certificats-par-l-api.md))                                                                                                               |
| `tools/simulator/.env` | `MQTT_URL`                                                                                 | `mqtt://127.0.0.1:1883`                                                                                                                                                                                                                                                                                                     |
|                        | `MQTT_USERNAME` / `MQTT_PASSWORD`                                                          | `simulator` / la valeur de `MQTT_SIMULATOR_PASSWORD`                                                                                                                                                                                                                                                                        |
|                        | `SITE_CODE`                                                                                | `SITE01`                                                                                                                                                                                                                                                                                                                    |
|                        | `SIMULATE_DEVICE`                                                                          | `false` si l'objet est l'ESP32 de Wokwi (**jamais `true` en même temps que Wokwi**), `true` pour s'en passer                                                                                                                                                                                                                |
|                        | `DEVICE_NAME`, `API_URL`, `DEVICE_MQTT_URL`, `BROKER_CA_PATH`                              | Laisser vides (mode objet : enrôlement auprès de l'API locale puis TLS mutuel sur `localhost:8883`). Avec `SIMULATE_DEVICE=true`, le simulateur affiche son empreinte et attend que la demande soit acceptée dans l'app (écran **Objets**) : l'API doit tourner. Chaque redémarrage du simulateur fait une nouvelle demande |
|                        | `FAULTY_PANELS`, `EXTRA_PANELS`                                                            | Facultatifs : panneaux dégradés (ex. `P07,P12`), panneaux absents du seed (ex. `P21`, détection automatique)                                                                                                                                                                                                                |
| `apps/mobile/.env`     | `EXPO_PUBLIC_DATA_SOURCE`                                                                  | **`api`** pour utiliser l'API réelle (la valeur par défaut `mock` affiche des données d'exemple sans serveur)                                                                                                                                                                                                               |
|                        | `EXPO_PUBLIC_API_URL`                                                                      | `http://localhost:3000/v1` (téléphone en USB, voir §3) ; sinon voir « sans câble »                                                                                                                                                                                                                                          |
|                        | `EXPO_PUBLIC_MOCK_SCENARIO`                                                                | Source `mock` seulement : `normal`, `device_offline`, `battery_full`, `no_alerts`, `phone_offline`                                                                                                                                                                                                                          |

Les variables `EXPO_PUBLIC_*` sont lues quand Metro construit le bundle : après une modification, relancer Metro avec `--clear`.

### 2.3 Certificats et mots de passe du broker

```powershell
pnpm mqtt:setup
```

Génère, tout étant ignoré par Git :

- dans `infra/mosquitto/generated/` : le fichier de mots de passe haché des clients `api` et `simulator`, l'autorité de certification du serveur (`ca.crt`, créée une seule fois), le certificat du serveur valable pour les noms de `MQTT_TLS_HOSTS`, et le certificat public de l'**autorité des objets** (`devices-ca.crt`) ;
- dans `infra/mosquitto/device-ca/` : la **clé de l'autorité des objets** (créée une seule fois) et sa base OpenSSL. Ce dossier n'est jamais monté dans le broker : seule l'API s'en servira pour signer le certificat d'un objet accepté ([D027](docs/journal/decisions/D027-certificat-objet-et-enrolement.md)). C'est le secret le plus sensible du projet : ne jamais le copier ni le partager ;
- dans `infra/mosquitto/devices/` : l'ACL des objets (vide : aucun droit par défaut) et la liste de révocation (vide). L'API les réécrira à l'acceptation et à la révocation d'un objet.

Docker doit tourner (OpenSSL et `mosquitto_passwd` s'exécutent dans des conteneurs). À relancer pour changer un mot de passe ou un nom d'hôte, puis recréer le broker :

```powershell
docker compose -f infra/docker-compose.yml up -d --force-recreate mqtt
```

L'écoute locale 1883 accepte `api` et `simulator` par mot de passe. L'écoute exposée 8883 n'accepte que des objets porteurs d'un certificat signé par l'autorité des objets, non expiré et non révoqué ; le nom commun du certificat (`device-site01`) sert d'identifiant MQTT. L'objet n'a plus de mot de passe.

Après une modification de `infra/mosquitto/devices/` (ACL ou liste de révocation), le broker relit les deux fichiers sans redémarrer ni couper les autres clients :

```powershell
pnpm mqtt:reload
```

Révoquer un objet consiste à retirer son entrée de l'ACL (ses publications sont refusées aussitôt, même sur une connexion déjà ouverte) et à ajouter son certificat à la liste de révocation (sa reconnexion est refusée), puis à recharger le broker. L'app le fera depuis la section « Objets » (#81, #82).

Pour vérifier le TLS mutuel sur le broker démarré (refus sans certificat, certificat expiré, d'une autre autorité ou révoqué ; droits limités d'un certificat valide) :

```powershell
pnpm mqtt:check-devices
```

Le script signe ses certificats de test avec une copie de l'autorité des objets, puis restaure l'ACL et la liste de révocation : il ne modifie rien de durable.

### 2.4 Base de données : démarrage, migrations, données de démonstration

```powershell
pnpm db:up
pnpm --filter api db:migrate
pnpm --filter api db:seed
```

- `db:up` démarre le conteneur TimescaleDB (service `db`).
- `db:migrate` applique les migrations de `apps/api/src/db/migrations/` (extensions `timescaledb` et `citext`, tables, hypertables et rétention de 30 jours).
- `db:seed` crée le site `SITE01`, son objet, les 20 panneaux (`infra/seed/demo-site.json`) et deux comptes. Il est relançable sans doublon, mais **ne modifie jamais une ligne existante**.

**Comptes de démonstration** (mots de passe : voir `SEED_OPERATOR_PASSWORD` et `SEED_VIEWER_PASSWORD` dans `apps/api/.env`) :

| Courriel              | Rôle                                    |
| --------------------- | --------------------------------------- |
| `operator@demo.local` | exploitant (`operator`) : peut piloter  |
| `viewer@demo.local`   | lecteur (`viewer`) : consultation seule |

Pour changer un mot de passe après le seed : modifier la variable, supprimer les consignes et les utilisateurs, puis relancer le seed (les consignes référencent leur auteur, leur historique est perdu) :

```powershell
docker exec infra-db-1 psql -U solar -d solar -c "delete from setpoints; delete from users;"
pnpm --filter api db:seed
```

### 2.5 Vérifier le premier lancement

```powershell
pnpm dev
```

Dans un autre terminal : `curl.exe http://localhost:3000/v1/health` doit renvoyer `{"status":...,"database":...,"broker":...}` avec la base et le broker joignables.

## 3. Lancer le développement

### 3.1 La pile serveur

```powershell
pnpm dev
```

Lance, dans l'ordre : `pnpm db:up` (base), `pnpm mqtt:up` (broker), puis en parallèle l'API (`pnpm --filter api dev`, port 3000, sur toutes les interfaces) et le simulateur (`pnpm --filter simulator dev`). Si l'un des deux plante, les autres s'arrêtent. Ctrl+C arrête l'API et le simulateur ; la base et le broker restent en route (`pnpm db:down` arrête les deux conteneurs, les données persistent dans des volumes Docker).

### 3.2 Metro et l'app sur le téléphone

L'app s'exécute dans un **build de développement** (voir §4), pas dans Expo Go. Metro sert le code JavaScript. Sous Windows, le port 8081 par défaut est parfois pris par un processus système : on utilise **8082**. Vérifiez `EXPO_PUBLIC_DATA_SOURCE=api` dans `apps/mobile/.env`.

**Téléphone relié par câble USB** (le plus fiable) :

```powershell
adb devices
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8082 tcp:8082
adb reverse tcp:8081 tcp:8082
pnpm --filter mobile start --localhost --port 8082
```

- `EXPO_PUBLIC_API_URL` reste `http://localhost:3000/v1` : le téléphone atteint l'API du PC par la redirection de port.
- Les trois `adb reverse` sont **à refaire à chaque rebranchement** du câble.
- Ouvrir l'app **Solar** (build de développement) : choisir le serveur de développement proposé, ou saisir l'URL affichée par Metro. Point à vérifier : l'écran exact du client de développement selon la version.
- `--` avant les options est aussi accepté (`pnpm --filter mobile start -- --localhost --port 8082`) : pnpm le transmet tel quel et Expo l'accepte.

**Sans câble (Wi-Fi)** : le PC et le téléphone doivent être sur le même réseau, et le PC doit accepter les connexions entrantes (voir « Réseau d'école ou d'entreprise » au §8). Remplacer `<IP du PC>` par l'adresse IPv4 donnée par `ipconfig` :

```powershell
$env:EXPO_PUBLIC_API_URL="http://<IP du PC>:3000/v1"
pnpm --filter mobile start --clear --port 8082
```

Pas de `--localhost` ici (Metro écoute sur le réseau). L'adresse IP change avec le réseau : la redonner à chaque changement. La variable d'environnement du terminal prime sur `apps/mobile/.env`.

**Autres commandes de l'app** : `pnpm --filter mobile android` (`expo start --android`), `pnpm --filter mobile test`, `pnpm --filter mobile typecheck`, `pnpm --filter mobile lint`.

Après avoir lancé Metro, vérifier que Expo n'a pas réécrit `apps/mobile/tsconfig.json` :

```powershell
git status
git checkout -- apps/mobile/tsconfig.json
```

### 3.3 Autres scripts utiles

| Commande                                                        | Effet                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm db:up` · `pnpm db:down`                                   | Démarre ou arrête la base et le broker (Docker Compose, `infra/docker-compose.yml`) |
| `pnpm mqtt:setup` · `pnpm mqtt:up`                              | Prépare puis démarre le broker                                                      |
| `pnpm mqtt:reload`                                              | Fait relire l'ACL des objets et la liste de révocation au broker                    |
| `pnpm mqtt:check-devices`                                       | Vérifie le TLS mutuel de l'écoute 8883 sur le broker démarré                        |
| `pnpm firmware:secrets --host <hôte> --port <port>`             | Génère `firmware/site-device/include/secrets.h` (ignoré par Git)                    |
| `pnpm --filter api dev`                                         | API seule (rechargement automatique)                                                |
| `pnpm --filter simulator dev` · `pnpm --filter simulator start` | Simulateur seul (avec ou sans rechargement)                                         |
| `pnpm --filter api db:generate`                                 | Génère une migration Drizzle après modification de `schema.ts`                      |

## 4. Build de développement de l'app et notifications push

### 4.1 Pourquoi un build de développement

Les modules natifs (`expo-sqlite`, `expo-notifications`, `expo-secure-store`, `react-native-svg`, `expo-location`…) ne sont pas tous dans Expo Go. Le client de développement (`expo-dev-client`) embarque ces modules et charge le JavaScript depuis Metro. **Il doit être récent** : une erreur « module natif introuvable » (par exemple `expo-sqlite`) signifie qu'il faut refaire un build et le réinstaller.

### 4.2 Construire l'APK avec EAS

```powershell
cd apps/mobile
eas login
eas whoami
eas build --profile development --platform android
```

- Le profil `development` (`apps/mobile/eas.json`) produit un APK interne avec le client de développement et utilise l'environnement EAS `development`.
- Le projet EAS est identifié par `extra.eas.projectId` dans `apps/mobile/app.config.ts` ; le compte attendu est celui du projet (`eas whoami` doit afficher `samuellnds`, ou un membre de son organisation). Point à vérifier : si le binôme utilise un autre compte Expo, il faut soit être invité sur ce projet, soit exécuter `eas init` pour créer le sien et remplacer l'identifiant.
- À la fin, EAS affiche l'URL de la page du build. **Les liens de téléchargement expirent** : relancer un build si besoin.

Installer l'APK, téléphone branché en débogage USB :

```powershell
adb install -r chemin\vers\solar.apk
```

(`-r` remplace l'app en gardant ses données.) Ou ouvrir le lien de la page du build sur le téléphone.

### 4.3 Notifications push (Firebase)

Les alertes `warning` et `critical` arrivent app **fermée** par le push Expo, qui s'appuie sur Firebase Cloud Messaging (FCM) sur Android ([D030](docs/journal/decisions/D030-notifications-push-expo-et-locales.md)). Sans cette configuration, tout fonctionne sauf les notifications. Procédure détaillée, étape par étape, dans [`apps/mobile/README.md`](apps/mobile/README.md). En résumé :

Cette configuration est **déjà faite** sur le projet EAS : le fichier `google-services.json` et la clé FCM sont stockés chez EAS. Un membre invité dans le projet Expo n'a aucun fichier Firebase à récupérer : il passe directement à l'étape 5. Les étapes 1 à 4 ne servent que pour un nouveau projet Firebase ou EAS.

1. Console Firebase : créer un projet, ajouter une app Android de nom de paquet exactement `fr.solar.mobile`, télécharger `google-services.json`.
2. Le ranger **hors du dépôt et hors OneDrive**, dans un dossier **sans espace ni guillemet dans le chemin** (par exemple `C:\secrets-solar\`), sinon `eas` répond « File does not exist ».
3. Le fournir à EAS par une variable de type fichier (`GOOGLE_SERVICES_JSON`, lue par `apps/mobile/app.config.ts`) :
   ```powershell
   cd apps/mobile
   eas env:set --name GOOGLE_SERVICES_JSON --type file --value C:\secrets-solar\google-services.json --environment development --environment preview --environment production --visibility secret
   eas env:list --environment development
   ```
   Pour un build local, `apps/mobile/google-services.json` est aussi lu s'il existe. Il est ignoré par Git (`apps/mobile/.gitignore`) et par Prettier (`.prettierignore`) : ne jamais le versionner.
4. Console Firebase, « Project settings », « Service accounts », « Generate new private key » : déposer cette clé de compte de service FCM V1 sur EAS par `eas credentials` (Android, profil `development`, « Google Service Account », « Push Notifications (FCM V1) »), puis la **supprimer du disque** (ou la garder dans un gestionnaire de mots de passe).
5. Refaire un build (§4.2) et le réinstaller.
6. Ouvrir l'app, se connecter, **accepter** la demande de notifications. Le jeton push n'est enregistré qu'une fois l'app ouverte et connectée. Vérification :
   ```powershell
   docker exec infra-db-1 psql -U solar -d solar -c "select platform, created_at from push_tokens"
   ```

**Règles voulues** ([D033](docs/journal/decisions/D033-regles-envoi-notifications-alerte.md)) : aucune notification quand l'app est au premier plan ; aucun push pour une consigne refusée (`setpoint_rejected`) ; aucune donnée personnelle dans un message.

## 5. Firmware et Wokwi

L'ESP32 simulé ne joint que des services accessibles depuis Internet : le broker local est exposé par un **tunnel bore** ([D031](docs/journal/decisions/D031-tunnel-bore-pour-wokwi.md)), temporaire jusqu'au VPS ([D028](docs/journal/decisions/D028-hebergement-vps.md)). Détails du montage, du comportement et du scénario de test : [`firmware/site-device/README.md`](firmware/site-device/README.md) et [`infra/README.md`](infra/README.md).

### 5.1 Une fois

1. Vérifier `MQTT_TLS_HOSTS=localhost,bore.pub` dans `infra/.env`, puis relancer `pnpm mqtt:setup` et recréer le broker (§2.3) : le certificat doit contenir `bore.pub`, sinon l'ESP32 le refuse.
2. Installer l'extension Wokwi dans VS Code, puis activer la licence gratuite : F1, « Wokwi: Request a New License » (à renouveler quand elle expire).

### 5.2 À chaque session

Terminal 1, la pile serveur **sans** `SIMULATE_DEVICE=true` (Wokwi remplace l'objet) :

```powershell
pnpm dev
```

Terminal 2, le tunnel, avec relance automatique car bore.pub (gratuit) coupe parfois :

```powershell
while ($true) { bore local 8883 --to bore.pub --port 6800; Start-Sleep 5 }
```

Terminal 3, une fois : les secrets du firmware (le **port du tunnel est compilé dans le firmware**), puis la compilation :

```powershell
pnpm firmware:secrets --host bore.pub --port 6800
cd firmware/site-device
python -m platformio run
```

`pnpm firmware:secrets` écrit `firmware/site-device/include/secrets.h` (ignoré par Git) à partir de `MQTT_TLS_HOSTS` et de `infra/mosquitto/generated/ca.crt`, sans rien afficher (plus de mot de passe d'objet depuis #80 : l'ESP32 ne se connecte plus tant que l'enrôlement, #83, n'est pas fait). La commande `pio` n'est souvent pas dans le `PATH` : utiliser `python -m platformio`. La première compilation télécharge la chaîne ESP32 ; elle produit `firmware/site-device/.pio/build/esp32dev/firmware.bin` et `.elf`.

Si le port 6800 est déjà pris, lancer `bore local 8883 --to bore.pub` **sans** `--port` : bore affiche `listening at bore.pub:<port>` ; reporter ce port par `pnpm firmware:secrets --host bore.pub --port <port>` et recompiler. Il faut aussi regénérer `secrets.h` et recompiler si l'autorité de certification a changé (suppression de `infra/mosquitto/generated/`).

Lancer le simulateur Wokwi : **`wokwi.toml` est dans `firmware/site-device/`**, pas à la racine. Ouvrir ce dossier dans VS Code, ou, depuis la racine, F1 « Wokwi: Select Config File » (choisir `firmware/site-device/wokwi.toml`), puis F1 « Wokwi: Start Simulator ». **Garder l'onglet du schéma visible** : la simulation se met en pause sinon.

Contrôle : le moniteur série affiche `Parc solaire - objet du site SITE01, firmware 0.1.0`, la connexion WiFi, l'heure NTP, puis `MQTT : connecté, statut online publié`. L'objet apparaît « en ligne » dans l'app.

### 5.3 Utiliser le simulateur

| Composant dans Wokwi | Effet                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Photorésistance      | Ensoleillement (irradiance) : monter le curseur de lux pour simuler du soleil (500 lux par défaut ≈ 4 W/m²) |
| Potentiomètre        | Facteur de production, de 0 à 4 000 W                                                                       |
| Deux relais          | Relais 1 : charge de la batterie ; relais 2 : injection sur le réseau                                       |
| Barre de 10 LED      | Niveau de la batterie, une LED par tranche de 10 %                                                          |
| Bouton               | Panne simulée : la production est divisée par 5 (second appui : rétablie)                                   |

Le moniteur série affiche une ligne lisible `Capteurs : lumière … | potentiomètre … -> production …`. La batterie démarre à **50 %** à chaque lancement.

Le scénario de pilotage complet (étapes 0 à 8, refus, reconnexion) est dans [`firmware/site-device/README.md`](firmware/site-device/README.md).

### 5.4 Sans Wokwi : l'objet simulé par Node

Pour travailler sans Wokwi ni tunnel : dans `tools/simulator/.env`, `SIMULATE_DEVICE=true`, puis `pnpm dev`. Le simulateur joue alors l'objet du site (mesures, statut, consignes). Il s'enrôle d'abord comme l'objet réel ([D027](docs/journal/decisions/D027-certificat-objet-et-enrolement.md)) : son terminal affiche son empreinte, que l'on compare dans l'app (écran **Objets**, depuis Supervision, compte exploitant) avant d'accepter. Il se connecte ensuite sur 8883 avec son certificat, sans mot de passe. Après un redémarrage du simulateur (`pnpm dev` recharge à chaque modification de son code), refuser l'ancienne demande dans l'app si elle bloque la nouvelle. **Ne jamais l'activer en même temps que Wokwi** : deux émetteurs publieraient les mesures de `SITE01`.

## 6. Vérifications

Les mêmes contrôles sont exécutés par la CI (`.github/workflows/ci.yml`) sur chaque pull request. Les lancer **séparément** (enchaîner avec `&&` peut masquer quel contrôle échoue) :

```powershell
pnpm lint
```

```powershell
pnpm typecheck
```

```powershell
pnpm test
```

```powershell
pnpm format:check
```

`pnpm format` corrige le formatage (Prettier, qui formate aussi le Markdown, sauf `docs/`, `CLAUDE.md`, `.claude/`, `firmware/`, voir `.prettierignore`).

Notes sur les tests :

- Les tests du simulateur qui comparent le firmware au code Node compilent du C++ avec le compilateur du poste (`c++`, `g++`, `clang++` ou la variable `CXX`). Sans compilateur, ils sont **ignorés** (la CI en dispose).
- Les tests d'agrégation `time_bucket` de l'API s'exécutent sur une vraie base si `TEST_DATABASE_URL` est définie (par exemple celle du Docker Compose), sinon ils sont ignorés.

## 7. Workflow Git

Règles complètes : [`CLAUDE.md`](CLAUDE.md) (section « Git et GitHub ») et [D021](docs/journal/decisions/D021-regles-de-travail.md). L'essentiel :

- `develop` : branche d'intégration et branche par défaut. `main` : version livrable, reçoit **uniquement** des pull requests venant de `develop` (merge commit).
- Une issue = une branche créée depuis `develop` (`<type>/<numéro>-<sujet-court>`, par exemple `feat/41-envoi-consigne`) = une pull request vers `develop`, relue par l'autre membre, fusionnée en **squash merge**. La documentation seule (`docs/`, `CLAUDE.md`, `.claude/`) peut être poussée directement sur `develop`.
- Commits en conventional commit sur **une seule ligne**, type et scope en anglais, description en français : `feat(api): ajoute l'envoi d'une consigne`. Types : `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `style`. Scopes : `api`, `mobile`, `contracts`, `simulator`, `firmware`, `infra`, `ci`, `design`, `journal`.
- Pas de push forcé sur `main` ni `develop`, pas de `--no-verify`, aucun secret dans le dépôt.
- Toute modification de la conception passe d'abord par le document concerné ; un choix structurant donne une fiche dans `docs/journal/decisions/`.
- Le code est en anglais ; commentaires, documentation et textes affichés en français.

## 8. Problèmes connus et solutions

### Metro : le port 8081 est occupé (Windows)

Un processus système occupe parfois 8081. Lancer Metro sur 8082 : `pnpm --filter mobile start --localhost --port 8082` (voir §3.2).

### Téléphone en USB : l'app n'atteint ni l'API ni Metro

Refaire les redirections de port, **à chaque rebranchement** :

```powershell
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8082 tcp:8082
adb reverse tcp:8081 tcp:8082
```

Sur Xiaomi (MIUI ou HyperOS), activer « Installer via USB » en plus du débogage USB, sinon `INSTALL_FAILED_USER_RESTRICTED`.

### Téléphone sans câble (Wi-Fi) : connexion impossible

Passer l'adresse de l'API par variable d'environnement et relancer Metro avec `--clear`, sur le même réseau (voir §3.2) :

```powershell
$env:EXPO_PUBLIC_API_URL="http://<IP du PC>:3000/v1"
pnpm --filter mobile start --clear --port 8082
```

**Réseau d'école ou d'entreprise** : ces Wi-Fi isolent souvent les appareils entre eux, et Windows les classe « Public » (connexions entrantes bloquées). Solution : utiliser le **partage de connexion du téléphone**, passer ce réseau en profil **Privé** (console PowerShell **administrateur**), puis ouvrir les ports 3000 et 8082 **pour le profil Privé seulement** :

```powershell
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
New-NetFirewallRule -DisplayName "Solar dev (reseau prive)" -Direction Inbound -Protocol TCP -LocalPort 3000,8082 -Action Allow -Profile Private
```

**Ne jamais ouvrir ces ports sur un réseau public** : l'API contient un compte de démonstration et Metro n'a aucun contrôle d'accès. L'adresse IP change avec le réseau (`ipconfig`).

### « Module natif introuvable » (par exemple `expo-sqlite`)

L'app installée est un build de développement trop ancien : refaire un build EAS (§4.2) et le réinstaller par `adb install -r`. Les liens de téléchargement des builds EAS expirent : relancer un build si besoin.

### Expo réécrit `apps/mobile/tsconfig.json`

Expo modifie parfois ce fichier au démarrage. Annuler :

```powershell
git checkout -- apps/mobile/tsconfig.json
```

### Firebase : `google-services.json`, clé FCM et jeton push

- `google-services.json` est fourni à EAS par la variable de type fichier `GOOGLE_SERVICES_JSON` (lue dans `apps/mobile/app.config.ts`), jamais versionné ; il est dans `.prettierignore` (et ignoré par Git).
- La clé de compte de service FCM V1 se dépose par `eas credentials`.
- Garder ces fichiers secrets **hors du dépôt et hors OneDrive**, dans un dossier dont le chemin n'a **ni espace ni guillemet** (par exemple `C:\secrets-solar\`), sinon `eas` répond « File does not exist ».
- Le jeton push n'est enregistré qu'après l'ouverture de l'app **connectée**. S'il manque : fermer et rouvrir l'app ; le journal de Metro affiche `[push] Push indisponible : <raison>`.
- Autres symptômes (`InvalidCredentials`, `DeviceNotRegistered`, Xiaomi) : tableau de dépannage de [`apps/mobile/README.md`](apps/mobile/README.md).

### Pas de notification quand l'app est ouverte, ni pour une consigne refusée

C'est **voulu** ([D033](docs/journal/decisions/D033-regles-envoi-notifications-alerte.md)) : au premier plan, l'alerte est déjà visible dans l'app ; un refus de consigne s'affiche sur l'écran Pilotage.

### Impossible de se connecter avec un compte de démonstration

Le mot de passe est celui de `SEED_OPERATOR_PASSWORD` ou `SEED_VIEWER_PASSWORD` dans `apps/api/.env`. Le seed ne modifie jamais un compte existant : si la variable a changé après le seed, supprimer les utilisateurs et relancer le seed (commandes au §2.4). Au-delà de 5 tentatives par minute et par adresse IP, l'API répond `429 TOO_MANY_ATTEMPTS`.

### `pnpm mqtt:setup` : « Mot de passe manquant » ou broker qui refuse les clients

Les deux mots de passe MQTT de `infra/.env` (`MQTT_API_PASSWORD`, `MQTT_SIMULATOR_PASSWORD`) doivent être renseignés (pas `change-me`) et correspondre à `MQTT_PASSWORD` de l'API et du simulateur. `MQTT_DEVICE_PASSWORD` ne sert plus : il peut être retiré de `infra/.env`. Après toute modification : `pnpm mqtt:setup`, puis `docker compose -f infra/docker-compose.yml up -d --force-recreate mqtt`.

### Certificat du broker refusé par l'ESP32

Le certificat doit contenir `bore.pub` : `MQTT_TLS_HOSTS=localhost,bore.pub` dans `infra/.env`, puis `pnpm mqtt:setup` et recréation du broker (§2.3).

### Wokwi : l'ESP32 ne se connecte pas au broker

- **Symptôme d'un tunnel absent** : moniteur série `MQTT : échec (code -2, TLS : ERROR - Generic error)` en boucle. Lancer le tunnel (§5.2).
- bore.pub est gratuit et coupe parfois (« connexion fermée par l'hôte distant ») : la boucle `while ($true) { bore local 8883 --to bore.pub --port 6800; Start-Sleep 5 }` le relance.
- Le port est **compilé dans le firmware** : si 6800 est pris, lancer bore sans `--port`, puis `pnpm firmware:secrets --host bore.pub --port <port>` et recompiler.
- Le tunnel est temporaire : en production, le broker est sur le VPS ([D028](docs/journal/decisions/D028-hebergement-vps.md), [D031](docs/journal/decisions/D031-tunnel-bore-pour-wokwi.md)).
- Tant que le tunnel est ouvert, le port est joignable depuis Internet : il n'accepte que des certificats d'objet signés par le projet. Fermer le tunnel (Ctrl+C) après usage.
- **Depuis #80, l'ESP32 ne peut plus se connecter** : l'écoute 8883 exige un certificat client, que le firmware n'obtiendra qu'avec l'enrôlement (#81, #83). En attendant, le simulateur joue l'objet du site (`SIMULATE_DEVICE=true`). Le moniteur série affiche alors un échec TLS à la connexion.

### Compiler le firmware : `pio` introuvable

Utiliser `python -m platformio run` dans `firmware/site-device`.

### Extension Wokwi

- `wokwi.toml` est dans `firmware/site-device/`, pas à la racine : F1 « Wokwi: Select Config File », puis « Wokwi: Start Simulator », ou ouvrir ce dossier dans VS Code.
- Licence gratuite à renouveler : F1 « Wokwi: Request a New License ».
- La simulation se met en pause si l'onglet du schéma n'est pas visible.
- Si **aucune commande Wokwi ne réagit**, l'hôte d'extensions de VS Code est bloqué (constaté avec l'extension Tailwind CSS qui parcourait des `node_modules`) : F1 « Developer: Reload Window », puis désactiver Tailwind pour ce projet.
- Le firmware tourne à environ **50 % du temps réel** dans Wokwi (maintien MQTT de 60 s, resynchronisation NTP toutes les 60 s) : voir « Dépannage » de [`firmware/site-device/README.md`](firmware/site-device/README.md).

### Simulateur : deux objets publient en même temps

`SIMULATE_DEVICE=true` fait jouer l'objet du site au simulateur Node : ne jamais l'activer avec Wokwi (`tools/simulator/.env`).

### Panneau inconnu (détection automatique)

Un panneau dont le code est absent de la base (par exemple `EXTRA_PANELS=P21`) est créé « à positionner » à sa première mesure ; l'exploitant le place depuis l'app avec la position GPS du téléphone ([D020](docs/journal/decisions/D020-inventaire-des-panneaux.md)).

### Enchaîner les vérifications avec `&&`

Cela peut masquer quel contrôle échoue : lancer `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` séparément (§6).

## 9. État d'avancement et suite

Socle, supervision, interface, pilotage côté API et app, alertes et notifications : réalisés (milestones « Conception », « Socle technique », « Intégration de l'interface » fermées). Restent des vérifications sur Wokwi, la sécurité de l'objet, la livraison puis les bonus.

Ordre conseillé (une ligne par issue, spécifications dans [`docs/conception/04-besoins-fonctionnels.md`](docs/conception/04-besoins-fonctionnels.md)) :

1. **Vérifications restantes** : #62 (placement GPS d'un panneau détecté, par exemple P21), #38 à #40 (lignes du scénario de pilotage dans Wokwi), #20 (coupure et retour du réseau).
2. **#108** : bandeau d'alerte dans l'app ouverte (aucune notification système au premier plan).
3. **Sécurité de l'objet** ([D027](docs/journal/decisions/D027-certificat-objet-et-enrolement.md)) : #80, #81, puis #84 et #83, et #82 (maquette de la section « Objets » d'abord).
4. **Livraison** : #54 (VPS), #53 (APK), #51 (dossier sécurité), #52 (tests), #55 (documentation), #56 (démonstration), #57 (point final du journal).
5. **Bonus** : #58 à #60, #63.

Le détail, issue par issue, est dans [`docs/synthese-projet.md`](docs/synthese-projet.md) (section « État d'avancement et suite »). L'état à jour : `gh issue list --state open --limit 100`.

## 10. Carte des documents

| Pour…                                                                                      | Lire                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Règles de travail (langue, Git, commandes, sécurité)                                       | [`CLAUDE.md`](CLAUDE.md)                                                                                                                                                                          |
| Présenter le projet à l'oral                                                               | [`docs/synthese-projet.md`](docs/synthese-projet.md)                                                                                                                                              |
| Périmètre et contexte                                                                      | [`docs/etude-faisabilite-parc-solaire.md`](docs/etude-faisabilite-parc-solaire.md)                                                                                                                |
| Tables, colonnes, enums, SQL                                                               | [`docs/conception/01-modele-donnees.md`](docs/conception/01-modele-donnees.md)                                                                                                                    |
| Comportements, séquences, règles d'alerte, algorithme                                      | [`docs/conception/02-uml.md`](docs/conception/02-uml.md)                                                                                                                                          |
| Arborescence, dépendances, topics MQTT, routes REST, constantes, variables d'environnement | [`docs/conception/03-cartographie-technique.md`](docs/conception/03-cartographie-technique.md)                                                                                                    |
| Issues, critères d'acceptation, définition de « terminé »                                  | [`docs/conception/04-besoins-fonctionnels.md`](docs/conception/04-besoins-fonctionnels.md)                                                                                                        |
| Couleurs, typographie, icônes, maquettes                                                   | [`docs/conception/05-charte-graphique.md`](docs/conception/05-charte-graphique.md)                                                                                                                |
| Pourquoi chaque choix a été fait                                                           | [`docs/journal/`](docs/journal/README.md) (fiches D001 à D034)                                                                                                                                    |
| Infrastructure Docker et tunnel bore                                                       | [`infra/README.md`](infra/README.md)                                                                                                                                                              |
| App mobile, configuration Firebase du push                                                 | [`apps/mobile/README.md`](apps/mobile/README.md)                                                                                                                                                  |
| Firmware, montage Wokwi, scénario de test du pilotage                                      | [`firmware/site-device/README.md`](firmware/site-device/README.md)                                                                                                                                |
| Organisation du dépôt                                                                      | `apps/mobile` (app Expo), `apps/api` (API Fastify), `packages/contracts` (schémas Zod partagés), `tools/simulator` (simulateur), `firmware/site-device` (ESP32), `infra/` (Docker, seed), `docs/` |
