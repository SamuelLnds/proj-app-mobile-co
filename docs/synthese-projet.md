# Synthèse du projet : support d'oral

Document court pour présenter et défendre le projet. Chaque affirmation renvoie au document ou au code qui la prouve ; pour le détail, suivre les liens. Installation et commandes : [README](../README.md).

1. [Le sujet en une minute](#1-le-sujet-en-une-minute)
2. [L'architecture](#2-larchitecture)
3. [Les technologies et pourquoi](#3-les-technologies-et-pourquoi)
4. [Les choix qui comptent](#4-les-choix-qui-comptent)
5. [Les mécanismes expliqués simplement](#5-les-mécanismes-expliqués-simplement)
6. [Données et historique](#6-données-et-historique)
7. [Sécurité](#7-sécurité)
8. [Limites et dérives assumées](#8-limites-et-dérives-assumées)
9. [État d'avancement et suite](#9-état-davancement-et-suite)
10. [Questions probables du jury](#10-questions-probables-du-jury)

## 1. Le sujet en une minute

> Une application mobile supervise et **pilote** un petit parc solaire équipé d'une batterie et raccordé au réseau. Elle montre la production en direct, alerte en cas d'anomalie et permet de décider à distance **comment la production se répartit entre la batterie et le réseau**. L'objet applique la consigne, ou la refuse si elle met la batterie en danger, et dit ce qu'il a réellement fait.

- **Pourquoi ce sujet** ([D001](journal/decisions/D001-sujet-parc-solaire.md)) : trente sujets ont été notés ; le parc solaire n'est pas celui qui a le plus haut score (17 sur 20, contre 18 pour deux autres), mais il prolonge directement la station météo du module (ensoleillement vers production), a une carte qui a du sens, une action retour naturelle et se simule entièrement dans Wokwi.
- **Le pilotage** ([D003](journal/decisions/D003-pilotage-batterie-reseau.md)) : le premier retour reprochait un projet trop passif. Un vrai pilotage à distance a donc été ajouté : la répartition batterie / réseau, plutôt qu'une rotation automatique des panneaux (qui est une boucle locale, peu « à distance »). La rotation reste un bonus.
- **Trois modes** ([D004](journal/decisions/D004-mode-restitution.md)) : manuel (l'exploitant choisit la part envoyée à la batterie), automatique (charge jusqu'à 80 % puis tout au réseau), restitution (la batterie se décharge vers le réseau). Le troisième mode est né d'un défaut de conception : sans lui, la limite des 20 % de batterie ne s'appliquait jamais.
- **Périmètre volontairement réduit** ([D002](journal/decisions/D002-perimetre-reduit.md)) : une app, une API, une base, un objet simulé. Le reste (vue 3D, rotation des panneaux, temps réel poussé, QR code) est en bonus, après le socle. **Exception : la sécurité n'est pas un bonus** ([D027](journal/decisions/D027-certificat-objet-et-enrolement.md)).
- **Les cinq gestes du module** : lire une grandeur (capteurs de l'ESP32), l'afficher (écrans Supervision, Carte, Pilotage), alerter au seuil (alertes et push), synchroniser vers un back-end (API et base), démo en direct (voir [étude de faisabilité](etude-faisabilite-parc-solaire.md), section 3).

Source : [étude de faisabilité](etude-faisabilite-parc-solaire.md), sections 1 à 4.

## 2. L'architecture

```
  ESP32 simulé (Wokwi) --MQTT TLS 8883--> tunnel bore --+
                                                        v
  Simulateur Node --MQTT 1883-------------------> Mosquitto <--MQTT 1883--> API Fastify <--SQL--> PostgreSQL
  (20 panneaux, objet optionnel)                  (Docker)                  (port 3000)           + TimescaleDB
                                                                              ^     |
                                                           REST + JWT (/v1)   |     | push
                                                                              |     v
                                                  App Expo <------------------+   Service Expo --> Firebase (FCM)
                                                  (SQLite local)                                        |
                                                       ^----------------------------------------------+
```

Dans le sens montant, l'objet publie ses mesures toutes les 5 s, le simulateur celles de chaque panneau toutes les 10 s ; l'API valide, enregistre, évalue les règles d'alerte. Dans le sens descendant, l'exploitant envoie une consigne par l'API, qui la publie en MQTT (conservée par le broker) ; l'objet l'applique et publie l'**état réellement appliqué**.

**Pourquoi ce découpage**

- **L'app ne parle jamais au broker** : elle passe par l'API REST avec un jeton JWT. Le broker n'a que trois clients (objet, simulateur, API), chacun avec ses droits.
- **Monorepo pnpm et paquet `@solar/contracts`** ([D011](journal/decisions/D011-monorepo-contrats.md)) : l'app, l'API et le simulateur échangent les mêmes formats. Ils sont décrits **une seule fois** (schémas Zod, énumérations, constantes, topics) ; un format modifié à un endroit casse la compilation partout où il sert. Le firmware C++ ne peut pas importer ces schémas : ses constantes sont recopiées dans `include/config.h` et des tests vérifient l'identité avec le TypeScript.
- **Le simulateur est dans `tools/`** ([D015](journal/decisions/D015-emplacement-simulateur.md)) : `apps/` ne contient que ce qui est livré.
- **Le simulateur peut jouer l'objet** ([D024](journal/decisions/D024-objet-simule-et-connexion-wokwi.md)) : l'API et l'app avancent sans dépendre de Wokwi ni du tunnel. L'algorithme de pilotage existe donc en double (TypeScript et C++), comparé par des tests sur plus de 20 000 combinaisons.

Sources : [cartographie technique](conception/03-cartographie-technique.md), sections 1 à 3.

## 3. Les technologies et pourquoi

Versions exactes : `package.json` de chaque paquet et `firmware/site-device/platformio.ini`.

**App mobile (`apps/mobile`)**

| Brique                                                         | Pourquoi                                                                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Expo + React Native, TypeScript                                | Langage déjà connu, même TypeScript que l'API, build de l'APK dans le cloud (EAS) ([D005](journal/decisions/D005-framework-mobile.md)) |
| Expo Router                                                    | Navigation par fichiers (`app/`), standard actuel d'Expo                                                              |
| TanStack Query                                                 | Rafraîchissement périodique, états de chargement et d'erreur, nouvelle tentative, sans le réécrire                    |
| `expo-sqlite`                                                  | Copie locale des dernières réponses : affichage sans réseau ([D014](journal/decisions/D014-stockage-local-sqlite.md)) |
| `expo-secure-store`                                            | Le jeton JWT est stocké chiffré, jamais dans SQLite                                                                   |
| `react-native-svg`                                             | Courbes et plan du parc dessinés à la main : fidèles à la maquette, aucune clé Google, fonctionne hors ligne ([D025](journal/decisions/D025-integration-interface.md)) |
| Icônes Phosphor (tracés embarqués), polices Red Hat (`@expo-google-fonts`) | Une famille pour titres, texte et chiffres (la version Mono évite que les valeurs « sautent ») ; icônes sans dépendance supplémentaire ([D016](journal/decisions/D016-typographie-red-hat.md), [D026](journal/decisions/D026-icones-phosphor-embarquees.md)) |
| `expo-notifications`, `expo-device`, `expo-dev-client`         | Réception du push ; build de développement (les modules natifs ne sont pas tous dans Expo Go)                         |
| `expo-location`, `@react-native-community/netinfo`             | Position GPS pour placer un panneau (D020) ; détection du mode hors ligne                                             |
| Jest + React Native Testing Library                            | Outils fournis avec Expo                                                                                              |

**API (`apps/api`), contrats et simulateur**

| Brique                                      | Pourquoi                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Fastify                                     | Validation intégrée, requêtes de test sans serveur (`inject`), plus léger que NestJS ([D010](journal/decisions/D010-api-rest-fastify.md)) |
| Zod + `fastify-type-provider-zod`           | Un schéma = validation à l'exécution **et** type TypeScript ; partagé via `@solar/contracts`                     |
| Drizzle ORM + `pg` + `drizzle-kit`          | Schéma en TypeScript proche du SQL, migrations générées, SQL brut possible pour TimescaleDB                       |
| `mqtt` (mqtt.js)                            | Client MQTT de référence en Node, reconnexion automatique                                                         |
| `@fastify/jwt`, `@fastify/rate-limit`       | Jeton HS256 de 8 h ; limite de 5 connexions par minute et par adresse IP                                          |
| `argon2` (argon2id)                         | Hachage des mots de passe recommandé par l'OWASP                                                                  |
| `expo-server-sdk`                           | Envoi des notifications push par le service Expo                                                                  |
| Vitest, `tsx`, `concurrently`, ESLint, Prettier | Tests rapides en TypeScript ; lancement parallèle de `pnpm dev` ; style homogène entre les deux membres        |

**Infrastructure et firmware**

| Brique                                                   | Pourquoi                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL + TimescaleDB (image `timescale/timescaledb`) | Une seule base pour le relationnel et les séries temporelles ([D009](journal/decisions/D009-base-timescaledb.md))  |
| Mosquitto (Docker)                                       | Broker auto-hébergé : identifiants et droits par client, TLS ([D023](journal/decisions/D023-broker-mosquitto-auto-heberge.md)) |
| bore                                                     | Tunnel TCP gratuit et sans compte pour que Wokwi joigne le broker ([D031](journal/decisions/D031-tunnel-bore-pour-wokwi.md)) |
| PlatformIO + Arduino, Wokwi                              | Démarrage rapide, nombreux exemples, aucun matériel à acheter ([D007](journal/decisions/D007-objet-wokwi.md))       |
| PubSubClient                                             | Client MQTT 3.1.1 standard de l'ESP32 (ne gère ni MQTT 5 ni la publication en QoS 1)                               |
| OneWire + DallasTemperature                              | Lecture de la sonde de température DS18B20                                                                        |
| Analyseur JSON écrit pour le projet                      | Format fermé, compilable sur le poste et comparé à Zod par des tests ([D032](journal/decisions/D032-analyseur-json-minimal-du-firmware.md)) |
| GitHub Actions, Dependabot, EAS Build                    | Vérifications à chaque pull request ; mises à jour des dépendances ; construction de l'APK                          |

## 4. Les choix qui comptent

Chaque choix est détaillé dans une fiche du [journal](journal/README.md) (D001 à D034) : contexte, options comparées, justification.

### Sujet et périmètre

On a choisi un sujet **simulable de bout en bout** et un périmètre **réduit à une app, une API, une base et un objet** (D001, D002). Ont été écartés d'emblée le TLS mutuel, l'OTA signée, PostGIS, GraphQL, plusieurs boîtiers : cités comme pistes d'évolution. Le pilotage batterie / réseau a remplacé la rotation des panneaux pour répondre au retour sur la communication bidirectionnelle (D003) ; le mode restitution a comblé un trou du modèle (D004).

### L'objet et le protocole

**MQTT 3.1.1 sur TLS** ([D006](journal/decisions/D006-protocole-mqtt.md)) : seul compatible à la fois avec un parc étendu et avec Wokwi (le BLE n'est pas simulé). La version 3.1.1 offre ce qu'il faut (messages conservés pour les consignes, Last Will pour la présence, QoS 1) et c'est celle de PubSubClient ; MQTT 5 a été écarté pour cette raison.

**Un seul ESP32 simulé dans Wokwi** (D007), plus un script qui joue 20 panneaux pour peupler la carte. Un boîtier par fonction a été envisagé puis écarté.

### Serveur et base

**Un revirement sur le broker.** Le choix initial était **HiveMQ Cloud** (offre gratuite, joignable depuis Wokwi, [D008](journal/decisions/D008-broker-hivemq-cloud.md)) : la contrainte forte était que Wokwi gratuit ne joint que des services publics sur Internet. Or HiveMQ n'acceptait plus de nouveau cluster gratuit (fin de l'offre le 31 décembre 2026). On est passé à **Mosquitto auto-hébergé dans Docker** ([D023](journal/decisions/D023-broker-mosquitto-auto-heberge.md)), avec en prime l'apprentissage de la configuration d'un broker (TLS, identifiants, droits). Le prix : Wokwi doit joindre ce broker local, d'où le **tunnel bore** ([D031](journal/decisions/D031-tunnel-bore-pour-wokwi.md)), solution gratuite et sans compte mais instable, temporaire jusqu'au **VPS** ([D028](journal/decisions/D028-hebergement-vps.md)).

**Base : PostgreSQL + TimescaleDB** (D009) plutôt qu'InfluxDB : une seule base à opérer, en SQL, avec `time_bucket` et la rétention automatique ; écartés : InfluxDB et QuestDB (deuxième base, outillage moins mûr). **API REST avec Fastify** (D010) plutôt que GraphQL : quelques secondes de latence suffisent, l'app interroge l'API toutes les 5 s.

### L'application

**Expo / React Native** (D005) : TypeScript déjà connu et partagé avec l'API, EAS pour l'APK. Flutter et Kotlin Multiplatform ont été écartés (nouveau langage). **TanStack Query pour le réseau, SQLite pour le stockage local** (D014) : l'option « SQLite seul » a été écartée par le groupe. **Carte et courbes dessinées en SVG** plutôt qu'avec `react-native-maps` (clé Google) ou une bibliothèque de graphiques (D025). **Interface intégrée d'abord sur données d'exemple** (D025) : une interface `DataSource` à deux implémentations (`mock` et `api`) a permis de finir l'interface sans attendre le serveur. Charte : palette accessible avec thème clair et sombre pour chaque jeton, aucune couleur écrite en dur ([D018](journal/decisions/D018-palette-et-themes.md)).

**Inventaire des panneaux** ([D020](journal/decisions/D020-inventaire-des-panneaux.md)) : un fichier de seed crée le parc de démonstration ; un panneau inconnu qui publie est créé « à positionner », et l'exploitant le place avec le GPS du téléphone. Aucun code à saisir, et un capteur du téléphone est utilisé.

### Notifications : deux revirements

Le push Expo passe par Firebase (un compte Google). **D029** l'a écarté pour ne dépendre d'aucun tiers et a mis en place un serveur **ntfy** auto-hébergé. À l'usage, c'était lourd : l'alerte s'affichait dans une **seconde app** à installer et configurer, et les services d'arrière-plan sont tués par certains constructeurs (Xiaomi). **D030** a donc rétabli le **push Expo** : une configuration unique par le développeur, puis un chemin standard et fiable en veille. Le risque assumé : le texte de l'alerte transite par Expo et Google, d'où la règle « aucune donnée personnelle dans une notification ». Les premiers essais sur téléphone ont ensuite montré du bruit inutile : **D033** supprime toute notification quand l'app est ouverte (l'alerte est déjà à l'écran) et tout push pour une consigne refusée (l'exploitant voit le résultat sur l'écran Pilotage). **D034** : « alerte lue » est un état propre à chaque téléphone (SQLite), sans changer l'API, parce que le besoin d'une synchronisation entre téléphones n'est pas établi.

### Sécurité

Authentification de l'objet par **certificat client délivré à l'exécution par enrôlement** ([D027](journal/decisions/D027-certificat-objet-et-enrolement.md)) : un projet Wokwi partagé est public, donc tout secret écrit dans le firmware serait lisible par tous. Hébergement final sur un **VPS** (D028) : seule option qui donne une adresse publique stable au broker sans service tiers.

### Organisation

**Code en anglais, commentaires, documentation et textes affichés en français** (D012), avec un glossaire. **`CLAUDE.md`, skills et flux Git** (`develop` branche d'intégration, `main` livrable, squash merge, conventional commits sur une ligne, [D021](journal/decisions/D021-regles-de-travail.md)). Le socle a été réalisé par un workflow d'agents sur une branche unique, suivi d'une vérification globale ([D022](journal/decisions/D022-socle-par-agents.md)). Le **dossier du journal** garde la trace de chaque choix : une fiche n'est jamais supprimée, elle est remplacée.

## 5. Les mécanismes expliqués simplement

Constantes : [`packages/contracts/src/constants.ts`](../packages/contracts/src/constants.ts). Règles : [UML, sections 5 à 7](conception/02-uml.md).

### Production attendue

Le site démo a un **facteur de production de 4 W par W/m²**. Production attendue du site = ensoleillement × 4. **Exemple** : avec 600 W/m², le site devrait produire 600 × 4 = **2 400 W**. Pour un panneau : ensoleillement × puissance nominale / 1 000 ; un panneau de 200 W à 600 W/m² devrait donner 600 × 200 / 1000 = **120 W**. Les panneaux n'ont pas de capteur : ils utilisent l'ensoleillement de la dernière mesure du site.

### Détecter un panneau sous-productif

Une alerte **`low_production`** s'ouvre quand, **en continu pendant 60 s**, l'ensoleillement dépasse 100 W/m² et la production est sous **70 %** de l'attendue. Exemple du site à 600 W/m² : alerte si la production reste sous 1 680 W. Elle se résout quand la production remonte à **80 %** (1 920 W) ou quand le soleil tombe sous 100 W/m². Le simulateur sait dégrader un panneau (`FAULTY_PANELS`) en divisant sa production par 5 : 120 W deviennent 24 W, bien sous le seuil de 84 W, et l'alerte s'ouvre après 60 s. Le bouton de panne de Wokwi fait pareil pour le site. Le décompte des 60 s est en mémoire dans l'API : un redémarrage le remet à zéro.

### Les règles d'alerte

| Alerte                 | S'ouvre                                | Se résout                          | Gravité  |
| ---------------------- | -------------------------------------- | ---------------------------------- | -------- |
| `low_production`       | voir ci-dessus                         | production ≥ 80 % de l'attendue    | warning  |
| `overheating`          | température > 75 °C                    | < 70 °C                            | critical |
| `battery_low`          | batterie ≤ 20 %                        | ≥ 25 %                             | warning  |
| `battery_full`         | batterie ≥ 95 %                        | ≤ 90 %                             | info     |
| `setpoint_rejected`    | consigne refusée par l'objet           | nouvelle consigne                  | warning  |
| `setpoint_no_response` | pas de réponse de l'objet après 30 s   | réponse reçue ou nouvelle consigne | critical |
| `device_offline`       | objet hors ligne                       | objet de nouveau en ligne          | critical |

**Hystérésis** : le seuil de résolution est différent de celui d'ouverture (20 % pour ouvrir, 25 % pour fermer), pour que l'alerte ne s'ouvre et ne se ferme pas en boucle autour d'une valeur. Une alerte résolue n'est **jamais rouverte** : si la condition revient, une **nouvelle** alerte est créée. Les alertes `info` ne déclenchent pas de push.

### Objet hors ligne

À la connexion, l'objet déclare un **Last Will** : si sa connexion tombe brutalement, le broker publie lui-même `offline`. Si la connexion reste ouverte sans trafic, le planificateur de l'API (passage toutes les 10 s) déclare l'objet hors ligne après **60 s sans message**. Une alerte critique `device_offline` s'ouvre, un push part, et **l'envoi d'une consigne est refusé** (`409 DEVICE_OFFLINE`). Au retour de l'objet, l'alerte se résout et il relit la dernière consigne conservée par le broker. L'app affiche l'objet comme hors ligne, avec ses dernières mesures ([UML, section 4.4](conception/02-uml.md)).

### L'algorithme de pilotage

L'objet recalcule **chaque seconde** ([UML, section 7](conception/02-uml.md)). Batterie : 10 000 Wh, puissance de charge maximale 3 000 W.

| Mode                   | Règle                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Manuel                 | L'exploitant choisit la part de la production vers la batterie (de 0 à 100 %, par pas de 10) ; le reste va au réseau              |
| Automatique            | Toute la production à la batterie tant qu'elle est sous 80 %, puis tout au réseau                                                 |
| Restitution            | La batterie se décharge vers le réseau à 3 000 W, jusqu'à 20 %                                                                    |

**Exemples avec 4 000 W de production** : en manuel à 70 %, 2 800 W vont à la batterie et 1 200 W au réseau (appliquée). À 100 %, la demande de 4 000 W dépasse la limite de charge de 3 000 W : seuls 3 000 W (soit **75 %**) sont acceptés, la consigne est **« appliquée en partie »** (raison `charge_limit`). Si la batterie est déjà à 95 % ou plus, une charge est **refusée** (`battery_full`) ; en restitution à 20 % ou moins, elle est refusée (`battery_low`). Une consigne mal formée est refusée (`invalid_setpoint`). Quand la production est nulle (la nuit), la part demandée est considérée comme appliquée : les flux sont simplement à zéro.

### Cycle de vie d'une consigne

1. L'exploitant choisit un mode et une part, confirme. L'API vérifie le jeton, le rôle `operator` et les bornes ; si l'objet est hors ligne, elle répond `409`.
2. L'API enregistre la consigne (statut `sent`) et la publie en MQTT, **conservée** par le broker (retained, QoS 1) ; elle répond `202` et arme un délai de **30 s**.
3. L'objet l'applique avec ses limites de sécurité et publie un **état** (conservé aussi) : `applied`, `partial` ou `rejected`, la part réellement appliquée et la raison.
4. L'API met à jour la consigne. Si aucune réponse n'arrive en 30 s : `no_response` (et alerte critique) ; une réponse tardive est quand même acceptée.
5. L'app interroge l'API toutes les 2 s pendant l'attente (60 s au plus) et affiche « Appliquée », « Appliquée en partie » ou « Refusée : batterie pleine ».

Le statut d'une consigne reflète **la première réponse** de l'objet ; la suite (par exemple la batterie qui se remplit) se voit dans l'état courant du site. Grâce au message conservé, un objet qui se reconnecte retrouve la consigne en vigueur ([UML, sections 4.3 et 5.1](conception/02-uml.md)).

### La batterie en temps accéléré

La batterie est simulée par le firmware : `BATTERY_TIME_FACTOR = 60`, donc **1 seconde réelle = 1 minute simulée**. Avec 3 000 W, la batterie reçoit 3 000 × 60 / 3 600 = 50 Wh par seconde, soit 0,5 % de 10 000 Wh : passer de 20 % à 95 % prend **150 s** (2 à 3 minutes) au lieu de 2 h 30. Elle démarre à 50 % à chaque lancement. Dans Wokwi (environ 50 % du temps réel), la durée mesurée en temps réel est à peu près double. Le simulateur Node applique le même facteur à une journée de soleil : une journée simulée dure 24 minutes.

### Détection automatique des panneaux ([D020](journal/decisions/D020-inventaire-des-panneaux.md))

Le seed crée P01 à P20. Si le simulateur publie un code inconnu (variable `EXTRA_PANELS=P21`), l'API le crée automatiquement (nom = code, 200 W, sans position, source `discovered`), dans la limite de 200 panneaux par site. L'exploitant le place depuis la vue Liste de l'écran Carte, avec la position GPS du téléphone ([UML, section 4.6](conception/02-uml.md)). Un panneau supprimé réapparaît à sa prochaine mesure : c'est voulu.

### Notifications et alertes lues ([D033](journal/decisions/D033-regles-envoi-notifications-alerte.md), [D034](journal/decisions/D034-alertes-lues-par-telephone.md))

Quand une alerte `warning` ou `critical` s'ouvre, l'API envoie un push à tous les jetons enregistrés (Expo puis Firebase). L'app **ouverte** n'affiche rien de plus : l'alerte est déjà visible. **Pas de push** pour `setpoint_rejected`. Un appui sur la notification ouvre le panneau concerné ou l'écran Alertes. Le contenu ne contient que le texte de l'alerte et des identifiants techniques. « Alerte lue » est stocké **dans la base locale du téléphone** : la pastille de l'onglet Alertes peut donc différer d'un téléphone à l'autre, et une alerte rouverte est de nouveau non lue.

### Copie locale hors ligne ([D014](journal/decisions/D014-stockage-local-sqlite.md))

Chaque réponse de l'API est enregistrée dans SQLite (`responses`) ; les écrans lisent la copie d'abord, puis se mettent à jour. Sans réseau, l'app affiche les dernières données, sa date de synchronisation et un bandeau. Le jeton JWT n'est jamais dans SQLite.

## 6. Données et historique

Tables ([modèle de données](conception/01-modele-donnees.md)) : `users`, `push_tokens`, `sites`, `devices`, `panels`, `site_measurements`, `panel_measurements`, `setpoints`, `alerts`. Les mesures sont des **hypertables TimescaleDB** découpées en tranches de 1 jour, avec une **rétention de 30 jours** (migration `0002_hypertables.sql`). Il n'y a **ni compression ni agrégat continu** : volumes faibles (environ 17 000 mesures du site et 173 000 mesures de panneaux par jour).

**Agrégation à la volée** : l'API calcule les moyennes avec `time_bucket()` à chaque demande. L'app choisit l'intervalle d'après la période affichée.

| Période de l'app | Intervalle de moyennage |
| ---------------- | ----------------------- |
| 1 h              | 1 min                   |
| 24 h             | 15 min                  |
| 7 jours          | 1 h                     |

L'API accepte aussi l'intervalle `5m` et refuse une période de plus de 7 jours.

**Topics MQTT** (`solar/{site}/…`, [cartographie, section 6](conception/03-cartographie-technique.md)) : `measurements` (objet, QoS 0, toutes les 5 s), `panels/{panel}/measurements` (simulateur, QoS 0, toutes les 10 s), `setpoint` (API vers objet, QoS 1, conservé), `state` (objet, QoS 1, conservé), `status` (objet et Last Will, QoS 1, conservé).

**Routes REST principales** (préfixe `/v1`, [cartographie, section 7](conception/03-cartographie-technique.md)) : `POST /auth/login`, `GET /sites` et `/sites/{id}`, `GET /sites/{id}/measurements`, `GET /sites/{id}/panels`, `GET /panels/{id}` et `/panels/{id}/measurements`, `PATCH` et `DELETE /panels/{id}` (exploitant), `POST /sites/{id}/setpoints` (exploitant), `GET /sites/{id}/setpoints`, `GET /alerts`, `POST` et `DELETE /push-tokens`. Erreurs au format unique `{ error: { code, message, details } }`.

## 7. Sécurité

**En place**

| Mesure                                  | Détail                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| TLS sur le broker                       | Écoute 8883 en TLS 1.2 avec une autorité de certification propre au projet ; l'écoute 1883 (sans TLS) n'est publiée que sur `127.0.0.1` |
| Comptes MQTT et droits                  | Pas d'accès anonyme ; trois clients (`api`, `simulator`, `device-site01`) avec des droits par topic (`infra/mosquitto/config/acl`)        |
| JWT                                     | HS256, durée de 8 h, pas de jeton de rafraîchissement ; limite de 5 tentatives de connexion par minute et par IP                         |
| Rôles                                   | `viewer` (consultation) et `operator` (consignes, gestion des panneaux), **vérifiés côté API** même si l'app masque les boutons         |
| Mots de passe                           | Hachés en argon2id                                                                                                                        |
| Validation des entrées                  | Chaque requête HTTP et chaque message MQTT est validé par un schéma Zod ; un message invalide est ignoré et journalisé                    |
| Secrets hors du dépôt                   | `.env`, `secrets.h`, certificats générés et `google-services.json` sont ignorés par Git ; seuls les `.env.example` sont versionnés       |
| Jeton de l'app                          | Stocké dans `expo-secure-store`                                                                                                           |
| Notifications                           | Aucune donnée personnelle dans un message push ni dans les logs                                                                           |

**Prévu : milestone « Sécurité de l'objet »** (#80 à #84, [D027](journal/decisions/D027-certificat-objet-et-enrolement.md)). Aujourd'hui, l'objet s'authentifie par un mot de passe écrit dans `secrets.h`, ce qui est inacceptable pour un projet Wokwi public. Cible : chaque objet génère une clé **P-256** en mémoire (qui ne le quitte jamais) et une demande de certificat ; l'exploitant **compare l'empreinte de la clé** affichée par l'objet sur le moniteur série avec celle de l'app, puis accepte ; l'API signe le certificat (nom imposé par le serveur, durée de 8 h par défaut, 48 h au plus) ; le broker exige ce certificat (TLS mutuel) et refuse les certificats révoqués ; un objet volé est **révoqué depuis l'app**. Aucun secret dans le firmware. **Hébergement** ([D028](journal/decisions/D028-hebergement-vps.md)) : un VPS avec Caddy (HTTPS) ; seuls les ports 443 et 8883 sont ouverts, SSH par clé.

## 8. Limites et dérives assumées

| Limite                                                  | Explication                                                                                                                                                      | Où c'est documenté                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Wokwi dans le cloud, tunnel bore instable               | L'ESP32 simulé ne joint pas le PC : bore.pub gratuit coupe parfois (relance en boucle) ; le port est compilé dans le firmware ; tunnel temporaire jusqu'au VPS    | D031, [README](../README.md#8-problèmes-connus-et-solutions) |
| Wokwi à environ 50 % du temps réel                      | Maintien MQTT porté à 60 s, resynchronisation NTP toutes les 60 s ; un arrêt brutal n'apparaît « hors ligne » qu'après 90 s au plus                              | [README du firmware](../firmware/site-device/README.md) |
| PubSubClient publie en QoS 0 seulement                  | L'état appliqué (`state`) devrait être en QoS 1 ; s'il est perdu, l'API passe la consigne en `no_response` puis accepte une réponse tardive                      | README du firmware, « Limites »                         |
| Analyseur JSON minimal                                  | Écrit pour le format fermé de la consigne ; comparé à Zod par des tests ; limites : chaîne de plus de 63 octets invalide                                         | [D032](journal/decisions/D032-analyseur-json-minimal-du-firmware.md) |
| Pas de délai entre deux alertes d'un même type          | Les seuils ont une hystérésis, mais une alerte résolue qui se rouvre crée une nouvelle alerte (et un nouveau push) sans temporisation (constaté dans `alerts/engine.ts`, non décrit dans la conception) | Code de l'API                                           |
| Le push exige un build de développement et Firebase     | Configuration unique par le développeur ; sans elle, tout marche sauf les notifications                                                                          | [README de l'app](../apps/mobile/README.md), D030        |
| Réseaux d'école ou d'entreprise                         | Ils isolent souvent les appareils : le téléphone n'atteint pas le PC ; solution : partage de connexion du téléphone ou câble USB                                 | [README](../README.md#8-problèmes-connus-et-solutions)  |
| Port 8081 occupé sous Windows                           | Metro est lancé sur 8082                                                                                                                                         | README                                                  |
| Pas de jeton de rafraîchissement                        | Le JWT dure 8 h, il faut se reconnecter ensuite                                                                                                                  | Cartographie, 7.1                                       |
| Quelques états en mémoire dans l'API                    | Le décompte des 60 s de `low_production` et l'état appliqué courant sont perdus au redémarrage (l'état est relu depuis le message conservé du broker)             | UML, section 6 ; cartographie, 7.3                      |
| La batterie est simulée et repart à 50 %                | Niveau recalculé par le firmware, pas de persistance entre deux lancements                                                                                       | README du firmware                                      |

**Dérives par rapport au plan initial** : HiveMQ Cloud abandonné pour Mosquitto (D008 vers D023) ; ntfy puis retour au push Expo (D029 vers D030) ; ArduinoJson retiré au profit d'un analyseur maison (D032) ; `phosphor-react-native` remplacé par des tracés embarqués (D026) ; `react-native-maps` et les bibliothèques de graphiques remplacés par du SVG (D025) ; notifications locales retirées (D033) ; sécurité de l'objet remontée de piste d'évolution en partie du socle (D027).

## 9. État d'avancement et suite

État au 27 novembre 2026, d'après `gh issue list` et `gh api repos/SamuelLnds/proj-app-mobile-co/milestones`.

| Milestone                  | État                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Conception                 | Terminée (4/4)                                                                           |
| Socle technique            | Terminé (14/14)                                                                          |
| Intégration de l'interface | Terminée (9/9) : toute l'app sur données d'exemple, thèmes clair et sombre               |
| Fil de bout en bout        | 9 faites ; reste #20 (coupure et retour du réseau à vérifier)                            |
| Supervision                | 13 faites ; reste #62 (vérifier le placement GPS d'un panneau détecté)                   |
| Pilotage                   | 6 faites (API, app) ; restent #38 à #40 (firmware : lignes du scénario à vérifier dans Wokwi) |
| Alertes et notifications   | 5 faites ; reste #108                                                                    |
| Sécurité de l'objet        | 0/5                                                                                      |
| Livraison                  | 0/7                                                                                      |
| Bonus                      | 0/4                                                                                      |

Spécifications : [`conception/04-besoins-fonctionnels.md`](conception/04-besoins-fonctionnels.md) (sections indiquées ; #108 y sera ajoutée).

**Ce qui reste, dans l'ordre conseillé**

1. **Vérifications**
   - #62 : placer sur la carte un panneau détecté (P21, `EXTRA_PANELS=P21`) avec le GPS du téléphone (section 10, « Ajouts au socle »).
   - #38, #39, #40 : dérouler dans Wokwi le scénario de pilotage du [README du firmware](../firmware/site-device/README.md) : limite de charge, mode automatique, restitution et refus à 20 %, production nulle, consigne invalide, reconnexion (section 6, M4).
   - #20 : couper puis rétablir le réseau, vérifier la reconnexion sans redémarrage (section 4, M2).
2. **#108** (milestone Alertes et notifications) : une nouvelle alerte, app ouverte, s'affiche dans un bandeau en haut de l'écran, puisqu'aucune notification système n'est montrée au premier plan.
3. **Sécurité de l'objet** (section 13, M9, [D027](journal/decisions/D027-certificat-objet-et-enrolement.md))
   - #80 : autorité des objets et TLS mutuel sur le broker (infra).
   - #81 : API d'enrôlement et de révocation des objets.
   - #84 : le simulateur en mode objet fait son enrôlement (test sans Wokwi).
   - #83 : le firmware génère sa clé, demande son certificat et se connecte avec.
   - #82 : section « Objets » de l'app (comparer l'empreinte, accepter, refuser, révoquer) ; **la maquette est à faire d'abord dans le canevas de maquettes**.
4. **Livraison** (section 8, M6)
   - #54 : héberger API, base et broker sur le VPS derrière Caddy (le fournisseur reste à choisir, cartographie section 11).
   - #53 : construire l'APK (profil EAS `preview`) pointant vers l'API hébergée.
   - #51 : revue de sécurité et dossier `docs/dossier-securite.md`.
   - #52 : compléter les tests (couverture de l'API, schémas, composants).
   - #55 : documentation technique (README racine, README par dossier, conception à jour).
   - #56 : scénario de démonstration et répétition avec plan de secours.
   - #57 : point final du journal (écarts prévu / réalisé, bilan) et décideurs des fiches à renseigner.
5. **Bonus** (section 9, M7), en dernier : #58 vue 3D du parc, #59 rotation des panneaux, #60 flux temps réel (SSE), #63 ajout d'un panneau par QR code.

## 10. Questions probables du jury

**Pourquoi MQTT ?** Parce que c'est le seul protocole du module à la fois adapté à un parc étendu (le BLE ne porte qu'à quelques mètres) et simulable dans Wokwi. Il apporte ce dont on a besoin : messages **conservés** pour que l'objet retrouve la dernière consigne à sa reconnexion, **Last Will** pour détecter une panne brutale, QoS 1 pour les commandes. La version 3.1.1 suffit et est celle que gère la bibliothèque de l'ESP32 (D006).

**Pourquoi TimescaleDB ?** On a des données relationnelles (utilisateurs, panneaux, consignes) et des séries de mesures. TimescaleDB est PostgreSQL : une seule base, en SQL, avec `time_bucket()` pour moyenner par intervalle et une rétention automatique de 30 jours. InfluxDB aurait demandé une deuxième base (D009).

**Pourquoi Expo ?** Le groupe connaît TypeScript, que l'API et les schémas partagés utilisent aussi ; EAS construit l'APK dans le cloud ; le push est intégré. Contrepartie : un build de développement est nécessaire dès qu'on utilise des modules natifs (D005).

**Pourquoi un monorepo ?** Les trois programmes échangent les mêmes formats. Un paquet `@solar/contracts` les définit une fois ; modifier un format casse la compilation partout où il sert, donc les incohérences se voient avant l'exécution (D011).

**Comment la production attendue est-elle calculée ?** Ensoleillement × facteur du site (4 W par W/m²) : à 600 W/m², 2 400 W attendus ; pour un panneau, ensoleillement × puissance nominale / 1 000. Une alerte s'ouvre si la production reste sous 70 % de l'attendue pendant 60 s avec plus de 100 W/m² de soleil (section 5).

**Que se passe-t-il si l'objet est hors ligne ?** Le broker publie le Last Will (ou l'API constate 60 s de silence) : l'objet passe hors ligne, une alerte critique est créée et un push est envoyé, l'envoi d'une consigne est refusé avec un message clair, et l'app affiche l'objet hors ligne avec ses dernières mesures. Au retour, l'objet relit la dernière consigne conservée et l'alerte se résout (section 5).

**Comment l'objet est-il sécurisé ?** Aujourd'hui : TLS sur le broker, identifiant et droits propres à l'objet. Cible, dans le socle : un certificat client obtenu à l'exécution, après que l'exploitant a comparé l'empreinte de la clé, sans aucun secret dans le firmware (le projet Wokwi est public), et révocable depuis l'app (D027). Ce n'est pas encore réalisé : c'est la prochaine grande étape (section 9).

**Pourquoi avoir changé de broker, puis de notifications ?** HiveMQ a fermé son offre gratuite : Mosquitto auto-hébergé nous a aussi fait pratiquer TLS et droits par client, au prix d'un tunnel pour Wokwi. ntfy évitait un compte Google mais imposait une seconde app, fragile en veille : le push Expo est plus simple pour l'utilisateur, avec le risque assumé que le texte de l'alerte transite par Expo et Google (D023, D030).

**L'app marche-t-elle sans réseau ?** Elle affiche les dernières données enregistrées dans SQLite, avec leur date et un bandeau ; les consignes exigent le réseau (section 5).
