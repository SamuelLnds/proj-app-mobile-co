# 03 · Cartographie technique

> Étape 1 de la conception. Ce document fixe **les technologies, leur rôle, leurs dépendances et les contrats d'échange** entre les briques. Il sert de référence pour la mise en place du socle (étape 5) et pour tout le développement.
>
> Les identifiants techniques (dossiers, fichiers, topics, routes, champs, codes d'erreur, variables) sont **en anglais** ([D012](../journal/decisions/D012-langue-du-code.md)). Le glossaire français ↔ anglais est dans [01-modele-donnees.md](01-modele-donnees.md).
>
> Les **versions exactes** des dépendances ne sont pas fixées ici : elles le seront à l'étape 5, au moment de l'installation, et figées par le fichier de verrouillage (`pnpm-lock.yaml`). Dependabot les tiendra ensuite à jour.

## 1. Vue d'ensemble

```mermaid
flowchart LR
  subgraph field["Terrain (simulé)"]
    ESP["Objet ESP32<br/>Wokwi · Arduino · PlatformIO"]
    SIM["Simulateur de panneaux<br/>Node.js · TypeScript"]
  end

  subgraph external["Services externes"]
    TUN["Tunnel TCP<br/>(ou passerelle privée Wokwi)"]
    EXPO["Service de notifications Expo"]
    FCM["Firebase Cloud Messaging<br/>(Google, Android)"]
    EAS["EAS Build<br/>(construction de l'APK)"]
  end

  subgraph server["Serveur (Docker Compose)"]
    API["API<br/>Node.js · Fastify · TypeScript"]
    DB[("PostgreSQL<br/>+ TimescaleDB")]
    MQ["Mosquitto<br/>broker MQTT"]
  end

  subgraph phone["Téléphone"]
    APP["App mobile<br/>Expo · React Native · TypeScript"]
    LOCAL[("SQLite local<br/>expo-sqlite")]
  end

  ESP -- "MQTT 8883 TLS<br/>mesures, état, statut" --> TUN
  TUN --> MQ
  MQ -- "consignes" --> TUN
  TUN --> ESP
  SIM -- "MQTT 1883 local<br/>panneaux, objet simulé" --> MQ
  MQ <-- "MQTT 1883 local" --> API
  API <-- "SQL 5432" --> DB
  APP <-- "HTTPS REST + JWT" --> API
  APP <--> LOCAL
  API -- "HTTPS<br/>alertes warning et critical" --> EXPO
  EXPO --> FCM
  FCM -- "push" --> APP
  EAS -. "APK" .-> APP
```

| Flux | Protocole | Sens | Sécurité |
|---|---|---|---|
| Objet ↔ broker | MQTT 3.1.1 sur TLS, port 8883, via un tunnel TCP ou la passerelle privée de Wokwi | Deux sens | TLS (autorité de certification du projet), identifiant et mot de passe propres à l'objet, droits limités à ses topics. Cible (milestone « Sécurité de l'objet ») : certificat client délivré par enrôlement après comparaison de l'empreinte de la clé, sans secret dans le code ([D027](../journal/decisions/D027-certificat-objet-et-enrolement.md)) |
| Simulateur ↔ broker | MQTT 3.1.1, port 1883, sur la même machine | Deux sens (mode objet du site) | Identifiant propre au simulateur, droits limités ; port publié sur 127.0.0.1 uniquement |
| API ↔ broker | MQTT 3.1.1, port 1883, sur la même machine | Deux sens | Identifiant propre à l'API ; port publié sur 127.0.0.1 uniquement |
| App ↔ API | HTTPS, JSON | Deux sens | JWT dans l'en-tête `Authorization: Bearer` |
| App ↔ SQLite local | Appels locaux | Deux sens | Données non sensibles uniquement (le JWT est dans `expo-secure-store`) |
| API → Expo | HTTPS (`expo-server-sdk`) | Montant | Jeton d'accès Expo facultatif (`EXPO_ACCESS_TOKEN`) ; aucune donnée personnelle dans le message : texte de l'alerte et identifiants techniques seulement ([D030](../journal/decisions/D030-notifications-push-expo-et-locales.md)) |
| Expo → FCM → téléphone | Service de notifications d'Expo, puis Firebase Cloud Messaging (Google) | Montant | Canal système ; le message transite par Expo et Google ; clé de compte de service FCM V1 déposée sur EAS, jamais versionnée |
| API ↔ base | Protocole PostgreSQL, port 5432 | Deux sens | Réseau Docker interne, utilisateur dédié |

> MQTT 3.1.1 suffit pour le socle : Last Will, retained et QoS 1 en font partie. La bibliothèque de l'ESP32 (PubSubClient) ne gère pas MQTT 5 ([D006](../journal/decisions/D006-protocole-mqtt.md)).

## 2. Environnements

| Environnement | Où tourne quoi | Usage |
|---|---|---|
| **Développement** | Base et broker Mosquitto dans Docker Compose sur le poste du développeur, API lancée sur le poste avec `tsx` (`pnpm dev`) ; notifications push via le service Expo et Firebase (aucun service local) ; le simulateur peut jouer l'objet du site ([D024](../journal/decisions/D024-objet-simule-et-connexion-wokwi.md)) ; app dans un *development build* sur téléphone ; objet dans Wokwi (navigateur ou extension VS Code) | Travail quotidien |
| **Démonstration** | API, base et broker dans Docker Compose sur un **VPS** derrière Caddy (HTTPS) ; notifications par le service Expo ; ESP32 de Wokwi connecté directement au broker du VPS ; APK installé sur le téléphone de test ([D028](../journal/decisions/D028-hebergement-vps.md)) | Soutenance |

L'hébergement final est un VPS ([D028](../journal/decisions/D028-hebergement-vps.md)) : seuls les ports 443 (API) et 8883 (MQTT en TLS mutuel) sont ouverts sur Internet. Le broker est **auto-hébergé** ([D023](../journal/decisions/D023-broker-mosquitto-auto-heberge.md)). Wokwi gratuit ne joignant que des services sur Internet, l'ESP32 simulé passe par un tunnel TCP vers le port 8883, ou par la passerelle privée de Wokwi (payante) en secours ; une fois le VPS en place, l'ESP32 joint directement son broker et le tunnel n'est plus utile ; cette connexion n'est nécessaire qu'à partir du travail sur le firmware ([D024](../journal/decisions/D024-objet-simule-et-connexion-wokwi.md)).

## 3. Organisation du dépôt

Monorepo géré avec **pnpm workspaces** ([D011](../journal/decisions/D011-monorepo-contrats.md)).

```
proj-app-mobile-co/
├── apps/                    # Ce qui est livré : utilisé par l'utilisateur ou déployé
│   ├── mobile/              # App Expo (React Native, TypeScript, Expo Router)
│   └── api/                 # API Fastify (TypeScript)
├── packages/                # Bibliothèques partagées
│   └── contracts/           # Schémas Zod partagés : messages MQTT, API, enums, constantes
├── tools/                   # Outillage de développement et de démo, jamais déployé
│   └── simulator/           # Simulateur des 20 panneaux (TypeScript)
├── firmware/
│   └── site-device/         # Projet PlatformIO de l'ESP32 + diagram.json Wokwi
├── infra/
│   └── docker-compose.yml   # PostgreSQL + TimescaleDB, Mosquitto (+ API pour la démo)
├── docs/
│   ├── etude-faisabilite-parc-solaire.md
│   ├── conception/          # Ce dossier
│   └── journal/             # Journal des études et des décisions
├── .github/
│   ├── workflows/           # CI (étape 5)
│   └── dependabot.yml       # (étape 5)
├── .claude/                 # Règles et skills partagés (étape 4)
├── CLAUDE.md                # (étape 4)
├── package.json             # Scripts racine
├── pnpm-workspace.yaml
└── tsconfig.base.json       # Options TypeScript communes
```

### Dépendances entre paquets

```mermaid
flowchart BT
  contracts["packages/contracts"]
  api["apps/api"] --> contracts
  mobile["apps/mobile"] --> contracts
  simulator["tools/simulator"] --> contracts
  firmware["firmware/site-device"] -. "reproduit les formats à la main" .-> contracts
```

**Règles :**
- `packages/contracts` ne dépend d'aucun autre paquet du dépôt et ne contient **aucune logique métier** : uniquement des schémas, des types, des enums, des constantes et des fonctions de construction de topics.
- Les applications et les outils ne s'importent **jamais** entre eux.
- `apps/` ne contient que ce qui est livré (app, API) ; `tools/` contient ce qui sert au développement et à la démo ([D015](../journal/decisions/D015-emplacement-simulateur.md)). La CI teste les deux, mais ne construit ni ne déploie `tools/`.
- Le firmware (C++) ne peut pas importer les schémas TypeScript : il reproduit les formats décrits en section 6, et ses messages sont validés par l'API avec ces mêmes schémas.

## 4. Choix technologiques

| Domaine | Choix | Raison | Alternatives écartées |
|---|---|---|---|
| Langage (hors firmware) | **TypeScript** partout | Un seul langage pour l'app, l'API, le simulateur et les schémas partagés | JavaScript (pas de typage), Python pour l'API (deux langages) |
| Gestion des paquets | **pnpm** (workspaces) | Monorepo natif, installation rapide, bonne prise en charge par Expo | npm workspaces (plus lent), Yarn, Turborepo (inutile à cette taille) |
| App mobile | **Expo + React Native** | JavaScript déjà connu ; build, notifications et mises à jour gérés par Expo | Flutter, Kotlin Multiplatform ([D005](../journal/decisions/D005-framework-mobile.md)) |
| Navigation mobile | **Expo Router** | Navigation par fichiers, standard actuel d'Expo | React Navigation configurée à la main |
| Appels réseau côté app | **TanStack Query** | Rafraîchissement périodique, états de chargement et d'erreur, nouvelle tentative automatique | `fetch` et `setInterval` écrits à la main |
| Stockage local côté app | **SQLite** (`expo-sqlite`) | Dernières données disponibles sans réseau, historique local consultable ([D014](../journal/decisions/D014-stockage-local-sqlite.md)) | AsyncStorage (clé-valeur, moins adapté à des listes) |
| Carte | **Plan du parc dessiné avec `react-native-svg`** | Fidèle à la maquette, aucune clé Google, fonctionne hors ligne ([D025](../journal/decisions/D025-integration-interface.md)) | react-native-maps (clé Google Maps sur Android), MapLibre |
| Graphiques | **Courbes dessinées avec `react-native-svg`** | Simples, sous contrôle, mêmes jetons que la charte ([D025](../journal/decisions/D025-integration-interface.md)) | react-native-gifted-charts, Victory Native |
| API | **Fastify** | Rapide, validation de schémas intégrée, injection de requêtes pour les tests | Express, NestJS, GraphQL ([D010](../journal/decisions/D010-api-rest-fastify.md)) |
| Validation | **Zod** (+ `fastify-type-provider-zod`) | Un schéma décrit un format une seule fois : il vérifie les données à l'exécution et fournit le type TypeScript | JSON Schema écrit à la main, class-validator |
| Accès à la base | **Drizzle ORM** + `pg` | Schéma en TypeScript proche du SQL, migrations générées, SQL brut possible pour TimescaleDB | Prisma (moins à l'aise avec TimescaleDB), requêtes SQL sans outil |
| Base | **PostgreSQL + TimescaleDB** | Relationnel et séries temporelles dans une seule base | InfluxDB, QuestDB ([D009](../journal/decisions/D009-base-timescaledb.md)) |
| Broker | **Mosquitto auto-hébergé** (Docker Compose) | Gratuit, sans service externe, droits par client et TLS configurés par le projet | HiveMQ Cloud (offre gratuite fermée), EMQX Cloud, AWS IoT ([D023](../journal/decisions/D023-broker-mosquitto-auto-heberge.md)) |
| Client MQTT (Node) | **mqtt.js** (`mqtt`) | Référence en Node.js, reconnexion automatique | — |
| Mots de passe | **argon2** (argon2id) | Recommandé par l'OWASP | bcrypt |
| Authentification | **JWT** via `@fastify/jwt` | Sans état, simple à vérifier | Sessions (état côté serveur) |
| Notifications | **expo-notifications** (app : réception du push) + **expo-server-sdk** (API), push Expo via Firebase Cloud Messaging | Fiable app fermée, sans friction ni coût de batterie notable, configuration unique par le développeur ; aucune notification au premier plan | ntfy auto-hébergé, tâche de fond, notifications locales ([D030](../journal/decisions/D030-notifications-push-expo-et-locales.md), qui remplace [D029](../journal/decisions/D029-notifications-locales-et-ntfy.md) ; notifications locales retirées par [D033](../journal/decisions/D033-regles-envoi-notifications-alerte.md)) |
| Firmware | **PlatformIO + framework Arduino** (PubSubClient, OneWire, DallasTemperature ; analyseur JSON des consignes écrit pour le projet, [D032](../journal/decisions/D032-analyseur-json-minimal-du-firmware.md)) | Démarrage rapide, nombreux exemples Wokwi | ESP-IDF pur, MicroPython |
| Tests | **Vitest** (API, contrats, simulateur), **Jest + React Native Testing Library** (app) | Vitest rapide et compatible TypeScript ; Jest est l'outil fourni par Expo | — |
| Qualité du code | **ESLint + Prettier**, configuration commune à la racine | Style homogène entre les membres du groupe | — |
| CI/CD | **GitHub Actions**, **Dependabot**, **EAS Build** | Gratuits pour un dépôt public ; EAS signe et construit l'APK | — |

## 5. Détail par application

### 5.1 `packages/contracts`

| Élément | Contenu |
|---|---|
| Rôle | Source unique des formats échangés |
| Dépendances | `zod` |
| Exports | Schémas des messages MQTT (section 6), schémas des requêtes et réponses REST (section 7), enums (identiques à la base), constantes partagées (section 8), fonctions de construction de topics (`siteMeasurementsTopic(siteCode)`…) |

```
packages/contracts/src/
├── enums.ts             # ControlMode, SetpointStatus, RejectionReason, AlertType…
├── constants.ts         # Seuils, délais, facteur de temps
├── mqtt/
│   ├── topics.ts        # Construction et analyse des topics
│   └── messages.ts      # SiteMeasurement, PanelMeasurement, Setpoint, ControlState, DeviceStatus
├── api/
│   ├── auth.ts
│   ├── sites.ts
│   ├── panels.ts
│   ├── setpoints.ts
│   ├── alerts.ts
│   └── errors.ts        # Format des erreurs et codes
└── index.ts
```

### 5.2 `apps/api`

| Dépendance | Rôle |
|---|---|
| `fastify` | Serveur HTTP |
| `fastify-type-provider-zod` | Validation des requêtes et réponses par les schémas Zod |
| `@fastify/jwt` | Création et vérification des JWT |
| `@fastify/rate-limit` | Limitation des tentatives de connexion |
| `drizzle-orm`, `pg` | Accès à PostgreSQL |
| `drizzle-kit` (dév.) | Génération et application des migrations |
| `mqtt` | Client MQTT |
| `argon2` | Hachage des mots de passe |
| `expo-server-sdk` | Envoi des notifications push |
| `@peculiar/x509` | Lecture des demandes de certificat (CSR), signature des certificats des objets et de la liste de révocation par l'autorité des objets ([D035](../journal/decisions/D035-signature-des-certificats-par-l-api.md)) |
| `reflect-metadata` | Polyfill exigé par `@peculiar/x509` (injection de dépendances de `tsyringe`), chargé avant elle |
| `pino-pretty` (dév.) | Logs lisibles en développement (Fastify utilise `pino`) |
| `tsx` (dév.) | Exécution TypeScript en développement |
| `vitest` (dév.) | Tests |
| `@vitest/coverage-v8` (dév.) | Couverture des services, mesurée à chaque `pnpm test` : moins de 80 % sur `setpoints`, `alerts`, `measurements` ou `auth` fait échouer les tests (#52) |
| `@solar/contracts` (interne) | Schémas partagés |

```
apps/api/src/
├── config.ts                 # Lecture et validation des variables d'environnement (Zod)
├── server.ts                 # Création de l'instance Fastify, plugins, routes
├── index.ts                  # Point d'entrée : démarre le serveur, le client MQTT et le planificateur
├── db/
│   ├── schema.ts             # Schéma Drizzle (reflet exact de 01-modele-donnees.md)
│   ├── client.ts
│   ├── migrations/
│   └── seed.ts               # Données de démonstration
├── mqtt/
│   ├── client.ts             # Connexion, abonnements, publication
│   └── handlers.ts           # Aiguillage des messages reçus vers les services
├── modules/
│   ├── auth/                 # routes.ts, service.ts
│   ├── sites/                # routes.ts, service.ts, repository.ts
│   ├── panels/
│   ├── measurements/         # Enregistrement des mesures reçues
│   ├── setpoints/
│   ├── alerts/               # engine.ts (règles de la section 6 de 02-uml.md, ouverture et résolution des alertes), routes.ts, service.ts, repository.ts
│   ├── notifications/        # Jetons push (routes.ts, service.ts, repository.ts) et envoi Expo (sender.ts, injectable dans les tests)
│   └── enrollment/           # Enrôlement des objets (routes.ts, service.ts, repository.ts), signature (authority.ts) et fichiers du broker (broker.ts, injectable dans les tests)
├── scheduler.ts              # Délais de réponse aux consignes, objets silencieux
└── errors.ts                 # Erreurs applicatives et format de réponse
```

Chaque module suit la même découpe : `routes.ts` (HTTP uniquement), `service.ts` (règles métier), `repository.ts` (requêtes à la base). Une route n'accède jamais directement à la base.

### 5.3 `apps/mobile`

| Dépendance | Rôle |
|---|---|
| `expo`, `expo-router` | Socle de l'app et navigation |
| `@tanstack/react-query` | Appels à l'API, rafraîchissement périodique |
| `expo-sqlite` | Stockage local des dernières données (disponibles sans réseau) |
| `@react-native-community/netinfo` | Détection de la connexion (désactivation du pilotage hors ligne) |
| `expo-location` | Position GPS du téléphone pour positionner un panneau ([D020](../journal/decisions/D020-inventaire-des-panneaux.md)) |
| `expo-secure-store` | Stockage du JWT |
| `expo-notifications`, `expo-device`, `expo-constants` | Notifications push (jeton Expo, réception, appui) ; `expo-notifications` et `expo-device` sont chargés à la demande (modules natifs) |
| `react-native-svg` | Plan du parc, courbes, icônes Phosphor (tracés embarqués, [D026](../journal/decisions/D026-icones-phosphor-embarquees.md)) |
| `expo-font` + polices Red Hat | Typographie (choix confirmé à l'étape 3) |
| `jest-expo`, `@testing-library/react-native` (dév.) | Tests |
| `@solar/contracts` (interne) | Schémas et types partagés |

```
apps/mobile/
├── app/                          # Écrans (Expo Router)
│   ├── _layout.tsx               # Fournisseurs : requêtes, thème, authentification, base locale
│   ├── login.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Barre d'onglets
│   │   ├── index.tsx             # Supervision
│   │   ├── map.tsx
│   │   ├── control.tsx           # Pilotage
│   │   └── alerts.tsx
│   ├── panel/[id].tsx            # Détail d'un panneau
│   └── devices.tsx               # Objets : demandes d'enrôlement, certificats, révocation (exploitant)
├── src/
│   ├── data/                     # DataSource : sources mock (données d'exemple) et api, choisies par EXPO_PUBLIC_DATA_SOURCE
│   ├── api/                      # Hooks TanStack Query, qui appellent la source de données active
│   ├── auth/                     # Contexte d'authentification, stockage du jeton
│   ├── storage/                  # Base SQLite locale `solar.db` : database.ts (ouverture et tables), responses.ts (dernières réponses de l'API), read-alerts.ts (alertes lues)
│   ├── components/               # Composants réutilisables
│   ├── theme/                    # Couleurs, typographie, espacements (étape 3)
│   ├── notifications/            # push.ts (autorisation et jeton Expo), local.ts (chargement du module, canal Android, gestionnaire qui ne montre rien au premier plan, cible d'un appui), NotificationEffects.tsx (appui sur une notification), alert-banner.ts et AlertBanner.tsx (bandeau d'alerte app ouverte, #108)
│   └── utils/
├── assets/                       # Polices, icône de l'app
├── app.config.ts                 # Configuration Expo (variables d'environnement)
└── eas.json                      # Profils de build (chacun lié à l'environnement EAS du même nom)
```

| Onglet ou écran | Fichier | Cas d'utilisation |
|---|---|---|
| Connexion | `app/login.tsx` | UC01 |
| Supervision | `app/(tabs)/index.tsx` | UC03, UC06 |
| Carte | `app/(tabs)/map.tsx` | UC04 |
| Pilotage | `app/(tabs)/control.tsx` | UC07, UC08 |
| Alertes | `app/(tabs)/alerts.tsx` | UC09 |
| Détail d'un panneau | `app/panel/[id].tsx` | UC05 |
| Objets (exploitant) | `app/devices.tsx` | UC20 |

**Tables locales de `solar.db`** (`src/storage/`), jamais envoyées à l'API et effacées à la déconnexion :

| Table | Colonnes | Rôle |
|---|---|---|
| `responses` | `key` (clé primaire), `body`, `saved_at` | Dernière réponse reçue pour chaque ressource, affichée au démarrage et sans réseau |
| `read_alerts` | `alert_id` (clé primaire, texte), `read_at` (ISO 8601) | Alertes actives que l'utilisateur a marquées comme lues sur ce téléphone ([D034](../journal/decisions/D034-alertes-lues-par-telephone.md)) |

`read_alerts` ne contient que des identifiants d'alertes actives : ceux qui ne le sont plus sont retirés quand la liste des alertes actives change. Les hooks `useReadAlerts` et `useUnreadAlertCount` (`src/api/`) partagent cet état entre l'écran Alertes et la pastille de l'onglet.

**Rôle de chaque outil côté app :** TanStack Query interroge l'API et gère le rafraîchissement ; chaque réponse reçue est enregistrée dans SQLite ; à l'ouverture de l'app ou sans réseau, l'écran affiche d'abord les données de SQLite avec leur ancienneté. TanStack Query suit l'état du réseau (`onlineManager`, NetInfo) et l'état de l'app (`focusManager`, `AppState`, `src/api/app-focus.ts`) : en arrière-plan, aucune interrogation de l'API ; au retour au premier plan, les écrans affichés sont rafraîchis aussitôt (#111).

### 5.4 `tools/simulator`

| Dépendance | Rôle |
|---|---|
| `mqtt` | Publication des mesures |
| `@peculiar/x509`, `reflect-metadata` | Demande de certificat (CSR) et vérification du certificat reçu en mode objet du site ([D035](../journal/decisions/D035-signature-des-certificats-par-l-api.md)) |
| `tsx` | Exécution |
| `@solar/contracts` (interne) | Format des messages et topics |

**Mode objet du site** (`SIMULATE_DEVICE=true`, [D024](../journal/decisions/D024-objet-simule-et-connexion-wokwi.md)) : le simulateur joue aussi l'ESP32. Il publie les mesures du site toutes les 5 s (ensoleillement suivant une courbe de journée accélérée), son statut et son Last Will, et applique les consignes avec l'algorithme de la section 7 de `02-uml.md`, qui sert d'implémentation de référence testée pour le firmware.

Comme l'objet réel ([D027](../journal/decisions/D027-certificat-objet-et-enrolement.md), #84), l'objet simulé s'enrôle avant de se connecter : il génère une clé P-256 en mémoire, affiche son nom et son empreinte (4 lignes de 4 groupes, comme dans l'app), envoie sa demande à l'API (`API_URL`), la suit toutes les `ENROLLMENT_POLL_PERIOD_S`, vérifie le certificat reçu (nom commun et clé publique), puis se connecte sur l'écoute 8883 (`DEVICE_MQTT_URL`) en TLS mutuel, **sans identifiant ni mot de passe**. Une demande refusée par l'API (autre demande en attente, API absente) est renouvelée toutes les 15 s. Une fois connecté, il contrôle son certificat toutes les 30 s : révoqué, expiré ou refusé, il se déconnecte et recommence avec une nouvelle clé. Les mesures des panneaux restent publiées sur la connexion du compte `simulator` (écoute 1883), qui n'a plus aucun droit sur les topics de l'objet. La clé privée reste en mémoire : chaque redémarrage du simulateur produit une nouvelle demande, à accepter dans l'app.

Comportement des panneaux : toutes les 10 s, pour chacun des 20 panneaux, publier une mesure dont la production suit l'ensoleillement de la dernière mesure du site (lue sur le topic `solar/SITE01/measurements`), avec une variation aléatoire de ± 5 %. Ce mode tourne toujours, avec ou sans `SIMULATE_DEVICE` (en mode objet du site, le simulateur lit ses propres mesures sur le broker) ; tant qu'aucune mesure du site n'a été reçue, aucune mesure de panneau n'est publiée. La variable d'environnement `FAULTY_PANELS` (par exemple `P07,P12`) divise la production de ces panneaux par 5, pour déclencher des alertes pendant la démo. La variable `EXTRA_PANELS` (par exemple `P21`) ajoute des panneaux absents du seed : l'API les détecte et les crée à l'état « non positionné », ce qui permet de démontrer l'inventaire ([D020](../journal/decisions/D020-inventaire-des-panneaux.md)).

### 5.5 `firmware/site-device`

| Bibliothèque | Rôle |
|---|---|
| `WiFi`, `WiFiClientSecure` (fournies) | Réseau et TLS |
| `PubSubClient` | MQTT |
| `OneWire`, `DallasTemperature` | Sonde DS18B20 |

Aucune bibliothèque JSON : les messages publiés sont construits dans `include/messages.h` et la consigne reçue est lue par un analyseur minimal (`include/setpoint.h`, [D032](../journal/decisions/D032-analyseur-json-minimal-du-firmware.md)). Tout ce code est sans Arduino, donc compilé aussi sur le poste : les tests le comparent aux schémas Zod (`tools/simulator/tests/firmware-format.test.ts` et `firmware-control.test.ts`) et à l'algorithme de référence du simulateur.

Composants Wokwi : photorésistance, potentiomètre, DS18B20, 2 relais, barre de LED, bouton (voir l'étude de faisabilité, section 6). La simulation tourne dans l'extension Wokwi pour VS Code (`wokwi.toml`, `diagram.json`), avec le binaire compilé par `pio run`.

```
firmware/site-device/
├── platformio.ini · wokwi.toml · diagram.json
├── include/   config.h (constantes partagées), pins.h, readings.h, messages.h, control.h (algorithme de la section 7),
│              setpoint.h (lecture de la consigne) et pilot.h (consigne en vigueur, batterie, état à publier) :
│              logique pure, sans Arduino ; secrets.example.h (modèle versionné) et secrets.h (ignoré par Git)
├── src/       main.cpp (boucle : pilotage chaque seconde, mesure toutes les 5 s, consigne dès réception),
│              network.cpp (WiFi, NTP, MQTT TLS, abonnement aux consignes), sensors.cpp (capteurs, bouton, sorties)
├── test/      format/dump_messages.cpp et control/ (dump_control.cpp, parse_setpoint.cpp) : programmes de poste
│              dont les sorties sont validées par le simulateur
└── README.md  Tableau des broches et procédure de test
```

Le broker est joint par le tunnel `bore` décrit dans `infra/README.md` ([D031](../journal/decisions/D031-tunnel-bore-pour-wokwi.md)). Les paramètres du broker (hôte, port, certificat de l'autorité du serveur ; plus de mot de passe depuis #80) sont dans `include/secrets.h`, généré par `pnpm firmware:secrets` à partir de `infra/.env` et de `infra/mosquitto/generated/ca.crt`. PubSubClient ne publie qu'en QoS 0 : `online` et l'état appliqué (`state`) sont donc publiés en retained QoS 0 (le Last Will, enregistré par le broker, est bien en QoS 1). L'abonnement aux consignes, lui, est en QoS 1 (`subscribe(topic, 1)`). Le tampon MQTT est de 512 octets (`MQTT_BUFFER_SIZE`) : un message entrant ou sortant plus grand serait ignoré, ce qui n'arrive pas avec les messages de la section 6.2 (moins de 320 octets).

La boucle exécute le pilotage **chaque seconde** (`CONTROL_TICK_PERIOD_MS`) : batterie (capacité 10 000 Wh, départ à 50 %), flux, relais et barre de LED ; la mesure part toutes les 5 s avec les valeurs du dernier tick. Une consigne reçue est analysée et appliquée aussitôt (dans la seconde), et son état est publié dans la foulée. Une consigne lisible mais invalide n'est pas adoptée : l'objet répond `rejected` / `invalid_setpoint` pour son identifiant, puis republie l'état de la consigne en vigueur. Une consigne illisible (JSON cassé, identifiant qui n'est pas un UUID) est ignorée et journalisée sur le port série. La consigne retained renvoyée après une reconnexion est appliquée sans republier d'état si elle est identique à celle en vigueur.

Wokwi simule l'ESP32 plus lentement que le temps réel (environ 50 %, moins si le panneau du simulateur est caché). Deux réglages propres au firmware, définis dans `include/config.h` et absents de `constants.ts`, en tiennent compte. Le maintien MQTT (`MQTT_KEEPALIVE_S`) est de 60 s : à 15 s, le PINGREQ arrivait trop tard et le broker coupait la session ; en contrepartie, le broker publie le Last Will `offline` au plus tard 1,5 × 60 = 90 s après un arrêt brutal. L'heure est resynchronisée par NTP toutes les 60 s (`NTP_RESYNC_INTERVAL_MS`, intervalle SNTP de l'ESP-IDF), sans quoi l'horloge de l'objet prendrait un retard croissant et, passé `MAX_CLOCK_DRIFT_S`, l'API remplacerait l'horodatage des mesures par l'heure de réception. Le firmware ne publie aucune mesure tant que l'heure n'est pas valide.

### 5.6 `infra`

| Service Docker Compose | Image | Port exposé | Rôle |
|---|---|---|---|
| `db` | `timescale/timescaledb` (étiquette PostgreSQL 16 ou plus) | `DB_PORT`, 5432 par défaut (développement seulement) | Base de données |
| `mqtt` | `eclipse-mosquitto:2` | `MQTT_PORT` (1883, sur 127.0.0.1 uniquement) et `MQTTS_PORT` (8883, TLS mutuel) | Broker MQTT ; configuration dans `infra/mosquitto/config/` (`mosquitto.conf`, `acl` de l'écoute 1883, `device-ca.cnf`, `reload.sh`), mots de passe hachés et certificats générés par `pnpm mqtt:setup` dans `infra/mosquitto/generated/` ; ACL des objets et liste de révocation dans `infra/mosquitto/devices/`, écrites par l'API ; clé de l'autorité des objets dans `infra/mosquitto/device-ca/`, jamais montée dans le broker (trois dossiers ignorés par Git, [D027](../journal/decisions/D027-certificat-objet-et-enrolement.md)) |
| `api` | Construite depuis `apps/api` | 3000 | API (démo ; en développement l'API tourne avec `tsx`) |

### 5.7 Notifications

Un seul mécanisme, le push Expo ([D030](../journal/decisions/D030-notifications-push-expo-et-locales.md)), sans service d'infrastructure ; les règles d'envoi sont celles de [D033](../journal/decisions/D033-regles-envoi-notifications-alerte.md).

**Push Expo.** À l'ouverture d'une alerte `warning` ou `critical`, sauf si son type figure dans `PUSH_EXCLUDED_ALERT_TYPES` (`setpoint_rejected` : alerte créée et visible dans l'app, mais sans push), le moteur d'alertes appelle `modules/notifications/service.ts`, qui envoie un message groupé à tous les jetons de `push_tokens` par `expo-server-sdk` (Expo relaie à Firebase Cloud Messaging sur Android). L'envoi est injectable dans les tests ; une erreur d'envoi est journalisée et ne perturbe jamais le traitement d'un message ; un jeton refusé avec l'erreur `DeviceNotRegistered` est supprimé.

| Élément | Valeur |
|---|---|
| Titre | `Alerte` (`warning`) ou `Alerte critique` (`critical`) |
| Corps | Le `message` de l'alerte, en français |
| Données (`data`) | `alertId`, `siteId`, `panelId` (ou `null`), `type` : identifiants techniques |
| Canal Android | `ALERT_NOTIFICATION_CHANNEL_ID` (`alerts`), priorité haute |
| Contenu interdit | Toute donnée personnelle (e-mail, nom d'utilisateur) |

**Au premier plan : rien.** Quand l'app est ouverte, l'alerte est déjà visible (badge de l'onglet Alertes, écran Alertes, interrogé toutes les 5 s) : aucune notification système, ni push ni locale. L'app n'envoie aucune notification locale. Le gestionnaire de notifications (`setNotificationHandler`) ne s'applique qu'à une notification reçue app au premier plan : il renvoie « ne pas afficher » (`shouldShowBanner`, `shouldShowList`, `shouldPlaySound` et `shouldSetBadge` à `false`).

**Hors premier plan : inchangé.** App fermée ou en arrière-plan, le système affiche le push. Un appui sur la notification ouvre le panneau concerné (`panelId`) ou l'écran Alertes.

**Modules natifs et Firebase.** `expo-notifications` et `expo-device` sont chargés à la demande : une app installée avant leur ajout désactive le push en silence. L'obtention du jeton Expo exige un build contenant la configuration Firebase du projet du binôme (`google-services.json`, fourni au build par la variable fichier EAS `GOOGLE_SERVICES_JSON`, jamais versionné) ; procédure dans [`apps/mobile/README.md`](../../apps/mobile/README.md#notifications-dalerte--configuration-firebase) ; la propriété `environment` de chaque profil de `eas.json` désigne l'environnement EAS dont les variables sont injectées au build. Sans elle, le build reste possible, mais l'app n'obtient pas de jeton push et ne reçoit aucune notification : les alertes restent visibles dans l'app.

## 6. Contrat MQTT

### 6.1 Topics

| Topic | Émetteur | Abonné | QoS | Retained | Fréquence |
|---|---|---|---|---|---|
| `solar/{siteCode}/measurements` | Objet | API, simulateur | 0 | non | Toutes les 5 s |
| `solar/{siteCode}/panels/{panelCode}/measurements` | Simulateur | API | 0 | non | Toutes les 10 s par panneau |
| `solar/{siteCode}/setpoint` | API | Objet | 1 | **oui** | À chaque consigne |
| `solar/{siteCode}/state` | Objet | API | 1 | **oui** | À la réception d'une consigne et à chaque changement de l'état appliqué |
| `solar/{siteCode}/status` | Objet (et broker via Last Will) | API | 1 | **oui** | À la connexion ; Last Will à la déconnexion brutale |

Abonnements de l'API : `solar/+/measurements`, `solar/+/panels/+/measurements`, `solar/+/state`, `solar/+/status`.

### 6.2 Format des messages

Tous les messages sont en **JSON UTF-8**, champs en `camelCase`, et portent un numéro de version de format `v` (actuellement `1`). Un message dont `v` est inconnu ou qui ne respecte pas le schéma est **ignoré** et journalisé en avertissement.

**`SiteMeasurement`** — `solar/{siteCode}/measurements`

| Champ | Type | Unité | Bornes | Description |
|---|---|---|---|---|
| `v` | entier | | `1` | Version du format |
| `timestamp` | chaîne ISO 8601 UTC | | | Date de la mesure (horloge NTP de l'objet) |
| `irradiance` | nombre | W/m² | 0 à 1 500 | Ensoleillement |
| `production` | nombre | W | ≥ 0 | |
| `temperature` | nombre | °C | -40 à 125 | |
| `batteryLevel` | nombre | % | 0 à 100 | |
| `batteryPower` | nombre | W | | Positif = charge, négatif = décharge |
| `gridPower` | nombre | W | ≥ 0 | |
| `mode` | `manual` \| `automatic` \| `discharge` | | | Mode en vigueur |
| `simulatedFault` | booléen | | | Bouton de démo actif |

```json
{
  "v": 1,
  "timestamp": "2026-11-20T10:15:05Z",
  "irradiance": 820,
  "production": 3150.5,
  "temperature": 41.2,
  "batteryLevel": 63.4,
  "batteryPower": 2205.4,
  "gridPower": 945.1,
  "mode": "manual",
  "simulatedFault": false
}
```

Si `timestamp` s'écarte de plus de 5 minutes de l'heure du serveur, l'API le remplace par l'heure de réception (protection contre une horloge d'objet mal réglée).

**`PanelMeasurement`** — `solar/{siteCode}/panels/{panelCode}/measurements`

| Champ | Type | Unité | Bornes |
|---|---|---|---|
| `v` | entier | | `1` |
| `timestamp` | chaîne ISO 8601 UTC | | |
| `production` | nombre | W | ≥ 0 |
| `temperature` | nombre | °C | -40 à 125 |

```json
{ "v": 1, "timestamp": "2026-11-20T10:15:10Z", "production": 158.3, "temperature": 40.8 }
```

**`Setpoint`** — `solar/{siteCode}/setpoint`

| Champ | Type | Bornes | Description |
|---|---|---|---|
| `v` | entier | `1` | |
| `id` | UUID | | Identifiant de la consigne en base |
| `mode` | `manual` \| `automatic` \| `discharge` | | |
| `batteryShare` | entier ou `null` | 0 à 100, multiple de 10 | Obligatoire en mode `manual`, `null` sinon |
| `issuedAt` | chaîne ISO 8601 UTC | | Date de création |

```json
{ "v": 1, "id": "0b8f3c1e-5d1a-4a53-9a0e-2f4b7c9d1e22", "mode": "manual", "batteryShare": 70, "issuedAt": "2026-11-20T10:16:00Z" }
```

**`ControlState`** — `solar/{siteCode}/state`

| Champ | Type | Description |
|---|---|---|
| `v` | entier | `1` |
| `setpointId` | UUID ou `null` | Consigne à laquelle cet état répond ; `null` si l'objet n'a encore reçu aucune consigne |
| `mode` | `manual` \| `automatic` \| `discharge` | Mode appliqué |
| `status` | `applied` \| `partial` \| `rejected` | Résultat de l'application |
| `appliedBatteryShare` | entier 0 à 100 ou `null` | Part effectivement appliquée (`null` en restitution ou si la consigne est invalide) |
| `reason` | `battery_full` \| `battery_low` \| `charge_limit` \| `invalid_setpoint` \| `null` | Renseignée si `status` vaut `partial` ou `rejected` |
| `timestamp` | chaîne ISO 8601 UTC | |

```json
{ "v": 1, "setpointId": "0b8f3c1e-5d1a-4a53-9a0e-2f4b7c9d1e22", "mode": "manual", "status": "partial", "appliedBatteryShare": 55, "reason": "charge_limit", "timestamp": "2026-11-20T10:16:01Z" }
```

**`DeviceStatus`** — `solar/{siteCode}/status`

| Champ | Type | Description |
|---|---|---|
| `v` | entier | `1` |
| `status` | `online` \| `offline` | |
| `firmwareVersion` | chaîne ou absent | Envoyée avec `online` uniquement |

```json
{ "v": 1, "status": "online", "firmwareVersion": "0.1.0" }
```

Le Last Will est le message fixe `{ "v": 1, "status": "offline" }`.

### 6.3 Identifiants sur le broker

| Client | Identifiant MQTT | Droits |
|---|---|---|
| Objet (écoute 8883) | `device-site01`, nom commun de son certificat | ACL des objets `infra/mosquitto/devices/acl`, écrite par l'API à l'acceptation : publier sur `solar/SITE01/measurements`, `state`, `status` ; s'abonner à `solar/SITE01/setpoint` |
| Simulateur (écoute 1883) | `simulator` | Fichier `infra/mosquitto/config/acl` : publier sur `solar/SITE01/panels/+/measurements` ; lire `solar/SITE01/measurements`. En mode objet du site, l'objet simulé se connecte à part sur 8883 avec le certificat obtenu par enrôlement (#84), comme l'objet réel |
| API (écoute 1883) | `api` | Fichier `infra/mosquitto/config/acl` : tous les topics `solar/#` |

L'app mobile n'a pas d'identifiant sur le broker : elle passe uniquement par l'API. Sur l'écoute TLS 8883 ([D027](../journal/decisions/D027-certificat-objet-et-enrolement.md), #80), l'objet s'authentifie par un certificat client signé par l'autorité des objets (`require_certificate`, `crlfile`), dont le nom commun sert d'identifiant MQTT (`use_identity_as_username`) ; il n'a pas de mot de passe. Sans entrée dans l'ACL des objets, il n'a aucun droit. L'écoute locale 1883 garde l'identifiant et le mot de passe pour l'API et le simulateur (`per_listener_settings`).

Après une modification de l'ACL des objets ou de la liste de révocation, le broker les relit sans redémarrer : `reload.sh` les recopie avec les permissions exigées puis envoie `SIGHUP` à Mosquitto (`pnpm mqtt:reload`). Vérifié avec Mosquitto 2.1.4 (`pnpm mqtt:check-devices`) : le retrait de l'ACL refuse aussitôt les publications d'une connexion déjà ouverte ; un certificat ajouté à la liste de révocation ne peut plus se reconnecter (le broker ne coupe pas la connexion ouverte, d'où le retrait de l'ACL en même temps).

## 7. Contrat de l'API REST

### 7.1 Règles générales

| Sujet | Règle |
|---|---|
| Format | JSON UTF-8, champs en `camelCase` |
| Préfixe | `/v1` (exemple : `/v1/sites`) |
| Nommage des routes | Anglais, `kebab-case`, ressources au pluriel (`/push-tokens`, `/setpoints`) |
| Authentification | `Authorization: Bearer <jwt>` sur toutes les routes sauf `/v1/auth/login` et `/v1/health` |
| JWT | Signé en HS256, durée de vie 8 h, contenu `{ sub: userId, role }`. Pas de jeton de rafraîchissement dans le socle : l'utilisateur se reconnecte. |
| Dates | Chaînes ISO 8601 en UTC |
| Pagination | Par curseur : paramètres `limit` (défaut 20, maximum 100) et `before` (date ISO) ; la réponse contient `items` et `next` (curseur ou `null`) |
| Validation | Toute requête est validée par les schémas de `packages/contracts` ; en cas d'échec, réponse 422 |
| Langue des messages | `code` en anglais (stable, utilisé par l'app) ; `message` en français (affichable tel quel) |

**Format des erreurs :**

```json
{ "error": { "code": "DEVICE_OFFLINE", "message": "L'objet du site est hors ligne, la consigne ne peut pas être envoyée.", "details": null } }
```

| Code HTTP | `code` | Cas |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Jeton absent, invalide ou expiré |
| 401 | `INVALID_CREDENTIALS` | Mauvais e-mail ou mot de passe |
| 403 | `FORBIDDEN` | Rôle insuffisant |
| 404 | `NOT_FOUND` | Ressource inexistante |
| 409 | `DEVICE_OFFLINE` | Consigne impossible, objet hors ligne |
| 409 | `ENROLLMENT_PENDING` | Une demande d'enrôlement d'une autre clé est déjà en attente pour cet objet |
| 409 | `INVALID_ENROLLMENT_STATE` | Action impossible dans l'état de la demande (accepter ou refuser une demande qui n'est plus en attente, révoquer un certificat qui n'est pas actif) |
| 422 | `INVALID_REQUEST` | Paramètres ou corps invalides (`details` liste les champs en erreur) |
| 422 | `INVALID_CSR` | Demande de certificat illisible, mal signée ou dont la clé n'est pas ECDSA P-256 |
| 429 | `TOO_MANY_ATTEMPTS` | Plus de 5 tentatives de connexion par minute et par adresse IP ; plus de 10 demandes d'enrôlement ou 30 suivis par minute et par adresse IP |
| 500 | `INTERNAL_ERROR` | Erreur inattendue (détail uniquement dans les logs) |
| 503 | `BROKER_UNAVAILABLE` | Décision d'enrôlement enregistrée, mais le broker n'a pas pu être rechargé (il le sera au prochain démarrage de l'API ou par `pnpm mqtt:reload`) |

### 7.2 Routes

| Méthode | Route | Rôle requis | Corps ou paramètres | Réponse |
|---|---|---|---|---|
| GET | `/v1/health` | aucun | | 200 `{ status, database, broker }` |
| POST | `/v1/auth/login` | aucun | `{ email, password }` | 200 `{ token, expiresAt, user }` |
| GET | `/v1/auth/me` | viewer | | 200 `User` |
| POST | `/v1/push-tokens` | viewer | `{ token, platform }` | 204 |
| DELETE | `/v1/push-tokens/{token}` | viewer | | 204 |
| GET | `/v1/sites` | viewer | | 200 liste de `SiteSummary` |
| GET | `/v1/sites/{id}` | viewer | | 200 `SiteDetail` |
| GET | `/v1/sites/{id}/measurements` | viewer | `from`, `to` (ISO, écart ≤ 7 jours), `interval` (`1m`, `5m`, `15m`, `1h`) | 200 liste de points moyennés |
| GET | `/v1/sites/{id}/panels` | viewer | | 200 liste de `PanelSummary` |
| GET | `/v1/panels/{id}` | viewer | | 200 `PanelDetail` |
| PATCH | `/v1/panels/{id}` | **operator** | `{ name?, latitude?, longitude?, ratedPowerW? }` (latitude et longitude ensemble) | 200 `PanelDetail` |
| DELETE | `/v1/panels/{id}` | **operator** | | 204 (supprime aussi ses mesures et alertes) |
| GET | `/v1/panels/{id}/measurements` | viewer | `from`, `to`, `interval` | 200 liste de points moyennés |
| POST | `/v1/sites/{id}/setpoints` | **operator** | `{ mode, batteryShare }` | 202 `Setpoint` |
| GET | `/v1/sites/{id}/setpoints` | viewer | `limit`, `before` | 200 page de `Setpoint` |
| GET | `/v1/alerts` | viewer | `status` (`active`, `resolved`), `siteId`, `limit`, `before` | 200 page d'`Alert` |
| POST | `/v1/enrollments` | aucun (objet) | `{ deviceName, csr }` (CSR en PEM) | 202 `EnrollmentStatus` (`pending` et empreinte) |
| GET | `/v1/enrollments/{fingerprint}` | aucun (objet) | | 200 `EnrollmentStatus` de la demande la plus récente pour cette empreinte |
| GET | `/v1/enrollments` | **operator** | `status`, `limit`, `before` | 200 page d'`Enrollment` |
| POST | `/v1/enrollments/{id}/accept` | **operator** | `{ ttlHours? }` (1 à `DEVICE_CERT_MAX_TTL_H`, défaut `DEVICE_CERT_DEFAULT_TTL_H`) | 200 `Enrollment` |
| POST | `/v1/enrollments/{id}/reject` | **operator** | | 200 `Enrollment` |
| POST | `/v1/enrollments/{id}/revoke` | **operator** | | 200 `Enrollment` |

Les deux routes de l'objet sont publiques (l'objet n'a pas de compte) et limitées en débit par adresse IP. Elles ne renvoient que des données publiques : le certificat n'est présent que lorsque la demande est acceptée et le certificat actif. Aucune route ne reçoit ni ne renvoie de clé privée.

### 7.3 Principaux objets renvoyés

| Objet | Champs |
|---|---|
| `User` | `id`, `email`, `name`, `role` |
| `SiteSummary` | `id`, `code`, `name`, `latitude`, `longitude`, `deviceStatus`, `latestMeasurement` (ou `null`), `activeAlertCount` |
| `SiteDetail` | Champs de `SiteSummary` + `peakPowerW`, `batteryCapacityWh`, `maxChargePowerW`, `currentSetpoint` (ou `null`), `controlState` (dernier `ControlState` reçu, ou `null`), `deviceLastSeenAt` |
| `LatestMeasurement` | `timestamp`, `irradiance`, `production`, `expectedProduction`, `temperature`, `batteryLevel`, `batteryPower`, `gridPower`, `mode`, `simulatedFault` |
| `PanelSummary` | `id`, `code`, `name`, `latitude` et `longitude` (ou `null` si non positionné), `placed`, `source` (`seed`, `discovered`, `manual`), `status` (`normal`, `alert`, `no_data`), `latestProduction`, `latestTemperature` |
| `PanelDetail` | Champs de `PanelSummary` + `ratedPowerW`, `expectedProduction`, `activeAlerts` |
| `Setpoint` | `id`, `mode`, `requestedBatteryShare`, `status`, `appliedBatteryShare`, `rejectionReason`, `author` (`{ id, name }`), `createdAt`, `respondedAt` |
| `Alert` | `id`, `type`, `severity`, `message`, `status`, `site` (`{ id, name }`), `panel` (`{ id, name }` ou `null`), `startedAt`, `endedAt` |
| `EnrollmentStatus` (objet) | `fingerprint`, `status`, `pendingExpiresAt`, `certificate` (PEM, seulement si `active`, sinon `null`), `certificateExpiresAt` (ou `null`) |
| `Enrollment` (app) | `id`, `deviceName`, `fingerprint`, `status`, `requestedAt`, `pendingExpiresAt`, `decidedAt`, `decidedBy` (`{ id, name }` ou `null`), `serialNumber`, `certificateExpiresAt`, `revokedAt` |

L'état appliqué courant (`controlState`) est conservé **en mémoire** par l'API (dernier message `state` reçu par site). Au redémarrage de l'API, il est récupéré grâce au message retained du broker.

## 8. Constantes partagées

Définies dans `packages/contracts/src/constants.ts`. Les valeurs propres au firmware sont recopiées dans le code de l'ESP32 et doivent rester **identiques**.

| Constante | Valeur | Utilisée par |
|---|---|---|
| `SITE_MEASUREMENT_PERIOD_S` | 5 | Objet |
| `PANEL_MEASUREMENT_PERIOD_S` | 10 | Simulateur |
| `SETPOINT_RESPONSE_TIMEOUT_S` | 30 | API (planificateur) |
| `DEVICE_SILENCE_TIMEOUT_S` | 60 | API (planificateur) |
| `PANEL_NO_DATA_TIMEOUT_S` | 60 | API (statut des panneaux) |
| `MAX_CLOCK_DRIFT_S` | 300 | API (validation de l'horodatage) |
| `BATTERY_TIME_FACTOR` | 60 | Objet |
| `BATTERY_FULL_PCT` / `BATTERY_FULL_RESOLVED_PCT` | 95 / 90 | Objet, API |
| `BATTERY_LOW_PCT` / `BATTERY_LOW_RESOLVED_PCT` | 20 / 25 | Objet, API |
| `AUTOMATIC_CHARGE_TARGET_PCT` | 80 | Objet |
| `OVERHEATING_C` / `OVERHEATING_RESOLVED_C` | 75 / 70 | API |
| `LOW_PRODUCTION_RATIO` / `LOW_PRODUCTION_RESOLVED_RATIO` | 0.70 / 0.80 | API |
| `MIN_IRRADIANCE_FOR_ALERT_W_M2` | 100 | API |
| `LOW_PRODUCTION_DURATION_S` | 60 | API |
| `BATTERY_SHARE_STEP_PCT` | 10 | App, API |
| `DEFAULT_PANEL_RATED_POWER_W` | 200 | API (panneau détecté) |
| `MAX_PANELS_PER_SITE` | 200 | API (limite de la création automatique) |
| `ALERT_NOTIFICATION_CHANNEL_ID` | `alerts` | API (canal du push), app (création du canal Android) |
| `PUSH_EXCLUDED_ALERT_TYPES` | `setpoint_rejected` | API (types d'alerte sans push, [D033](../journal/decisions/D033-regles-envoi-notifications-alerte.md)) |
| `ENROLLMENT_PENDING_TTL_MIN` | 30 | API (expiration d'une demande d'enrôlement, [D027](../journal/decisions/D027-certificat-objet-et-enrolement.md)) |
| `ENROLLMENT_POLL_PERIOD_S` | 3 | Objet, simulateur (suivi de la demande) |
| `DEVICE_CERT_DEFAULT_TTL_H` / `DEVICE_CERT_MAX_TTL_H` | 8 / 48 | API, app (durée du certificat d'un objet) |
| Paramètres du site de démo | crête 4 000 W, batterie 10 000 Wh, charge max 3 000 W, facteur 4.0 | Seed, objet |

## 9. Variables d'environnement

Aucune valeur secrète n'est versionnée. Chaque application fournit un fichier `.env.example` (versionné, sans secret) ; le fichier `.env` réel est ignoré par Git.

| Application | Variable | Exemple | Secrète |
|---|---|---|---|
| api | `PORT` | `3000` | non |
| api | `DATABASE_URL` | `postgres://solar:***@localhost:5432/solar` | **oui** |
| api | `JWT_SECRET` | 64 caractères aléatoires | **oui** |
| api | `MQTT_URL` | `mqtt://127.0.0.1:1883` (`127.0.0.1` plutôt que `localhost`, qui désigne d'abord `::1` sous Windows) | non |
| api | `MQTT_USERNAME` / `MQTT_PASSWORD` | `api` / `***` | **oui** (mot de passe) |
| api | `EXPO_ACCESS_TOKEN` | facultatif : jeton d'accès du compte Expo ; sans lui, les notifications partent quand même | **oui** |
| api | `LOG_LEVEL` | `info` | non |
| api | `DEVICE_CA_CERT_PATH` | `../../infra/mosquitto/device-ca/devices-ca.crt` (par défaut) : certificat de l'autorité des objets | non |
| api | `DEVICE_CA_KEY_PATH` | `../../infra/mosquitto/device-ca/devices-ca.key` (par défaut) : **clé de l'autorité des objets**, lue au moment de signer, jamais journalisée | **oui** (fichier) |
| api | `BROKER_DEVICES_DIR` | `../../infra/mosquitto/devices` (par défaut) : ACL des objets et liste de révocation écrites par l'API | non |
| api | `BROKER_RELOAD_COMMAND` | `docker compose -f ../../infra/docker-compose.yml exec -T mqtt sh /src/config/reload.sh` (par défaut) : commande de rechargement du broker, arguments séparés par des espaces | non |
| api (seed) | `SEED_OPERATOR_PASSWORD` / `SEED_VIEWER_PASSWORD` | `***` | **oui** |
| api (tests) | `TEST_DATABASE_URL` | facultatif, même forme que `DATABASE_URL` : active les tests sur une base TimescaleDB réelle (transactions annulées) | **oui** |
| simulator | `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD` | | **oui** (mot de passe) |
| simulator | `SITE_CODE` | `SITE01` | non |
| simulator | `FAULTY_PANELS` | `P07,P12` | non |
| simulator | `SIMULATE_DEVICE` | `true` (le simulateur joue l'objet du site) | non |
| simulator | `DEVICE_NAME` | `device-site01` (par défaut : `device-` suivi du code du site en minuscules) | non |
| simulator | `API_URL` | `http://127.0.0.1:3000/v1` (par défaut) : API d'enrôlement | non |
| simulator | `DEVICE_MQTT_URL` | `mqtts://localhost:8883` (par défaut) : écoute TLS mutuelle du broker | non |
| simulator | `BROKER_CA_PATH` | `../../infra/mosquitto/generated/ca.crt` (par défaut) : autorité du serveur, publique | non |
| infra | `MQTT_API_PASSWORD` / `MQTT_SIMULATOR_PASSWORD` | `***` | **oui** |
| infra | `MQTT_TLS_HOSTS` | `localhost,bore.pub` | non |
| infra | `DB_PORT` / `MQTT_PORT` / `MQTTS_PORT` | `5432` / `1883` / `8883` | non |
| simulator | `EXTRA_PANELS` | `P21` | non |
| mobile | `EXPO_PUBLIC_API_URL` | `https://api.example.com/v1` | non (visible dans l'app) |
| mobile | `EXPO_PUBLIC_DATA_SOURCE` | `mock` ou `api` | non |
| mobile | `EXPO_PUBLIC_MOCK_SCENARIO` | `normal`, `device_offline`, `phone_offline`, `battery_full`, `no_alerts` | non |
| mobile (build) | `GOOGLE_SERVICES_JSON` | variable EAS de type fichier (chemin de `google-services.json`, configuration Firebase du binôme) ; à défaut, `google-services.json` local, ignoré par Git | **oui** (fichier) |
| infra | `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `solar` / `***` / `solar` | **oui** (mot de passe) |

Côté firmware, les identifiants WiFi, l'hôte et le port du broker et le certificat de l'autorité du serveur sont placés dans un fichier `secrets.h` ignoré par Git, avec un modèle `secrets.example.h` versionné ; `pnpm firmware:secrets --host <hôte> --port <port>` le génère à partir de `infra/.env` (variable `MQTT_TLS_HOSTS`). L'objet n'a plus de mot de passe MQTT (#80) : il se connectera avec le certificat obtenu par enrôlement (#83).

## 10. Décisions structurantes

Le détail (contexte, options comparées, justification) est dans le [journal des décisions](../journal/README.md).

| Décision | Résumé |
|---|---|
| [D011](../journal/decisions/D011-monorepo-contrats.md) | Monorepo pnpm, un paquet `contracts` partagé |
| [D012](../journal/decisions/D012-langue-du-code.md) | Code en anglais ; commentaires, documentation et textes affichés en français |
| [D010](../journal/decisions/D010-api-rest-fastify.md) | REST + interrogation périodique, pas de WebSocket ni de GraphQL dans le socle |
| [D003](../journal/decisions/D003-pilotage-batterie-reseau.md) | L'objet a toujours le dernier mot sur la batterie ; l'API valide aussi les bornes |
| [D006](../journal/decisions/D006-protocole-mqtt.md) | MQTT 3.1.1, consigne publiée en retained |
| [D023](../journal/decisions/D023-broker-mosquitto-auto-heberge.md) | Broker Mosquitto auto-hébergé, ESP32 de Wokwi relié par tunnel TCP |
| [D024](../journal/decisions/D024-objet-simule-et-connexion-wokwi.md) | Le simulateur peut jouer l'objet du site ; connexion de Wokwi repoussée au firmware |
| [D009](../journal/decisions/D009-base-timescaledb.md) | Historique agrégé à la volée avec `time_bucket()` |
| [D014](../journal/decisions/D014-stockage-local-sqlite.md) | TanStack Query pour le réseau, SQLite pour le stockage local |
| [D028](../journal/decisions/D028-hebergement-vps.md) | Hébergement final sur un VPS : API, base, broker et Caddy ; Wokwi joint directement le broker |
| [D027](../journal/decisions/D027-certificat-objet-et-enrolement.md) | Objet authentifié par certificat client délivré par enrôlement, révocable ; aucun secret dans le firmware |
| [D030](../journal/decisions/D030-notifications-push-expo-et-locales.md) | Notifications : push Expo (Firebase), à la place de ntfy ([D029](../journal/decisions/D029-notifications-locales-et-ntfy.md) remplacée) ; notifications locales retirées par [D033](../journal/decisions/D033-regles-envoi-notifications-alerte.md) |
| [D033](../journal/decisions/D033-regles-envoi-notifications-alerte.md) | Aucune notification au premier plan ; pas de push pour une consigne refusée (`setpoint_rejected`) |
| [D034](../journal/decisions/D034-alertes-lues-par-telephone.md) | Alertes lues : état propre à chaque téléphone, table SQLite locale `read_alerts`, rien côté API |

Les versions sont fixées à l'installation et tenues à jour par Dependabot : aucune version n'est inventée dans la documentation.

## 11. Points ouverts

| Sujet | Options | À trancher |
|---|---|---|
| Fournisseur du VPS ([D028](../journal/decisions/D028-hebergement-vps.md)) | À comparer : prix, localisation des données, IPv4 publique | Avant l'issue #54 |
| Connexion de l'ESP32 de Wokwi au broker | Tunnel TCP gratuit (bore ou équivalent) ; passerelle privée Wokwi (payante) ; vrai ESP32 | Avant le travail sur le firmware (issue #65) |
| Polices, icônes, couleurs | Red Hat, Phosphor, palette accessible | Étape 3 (maquettage) |
| Bibliothèque de test de bout en bout mobile | Maestro, ou rien dans le socle | Étape 5 |
