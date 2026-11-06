# 02 · Modélisation UML

> Étape 1 de la conception. Ce document décrit **le comportement attendu** du système : qui fait quoi, dans quel ordre, et avec quelles règles. Les noms techniques (topics, routes, champs) sont définis dans [03-cartographie-technique.md](03-cartographie-technique.md) ; les tables dans [01-modele-donnees.md](01-modele-donnees.md).
>
> Les diagrammes sont écrits en Mermaid et s'affichent directement sur GitHub. Les identifiants techniques sont en anglais ([D012](../journal/decisions/D012-langue-du-code.md)) ; les textes explicatifs et les noms de cas d'utilisation restent en français. Pour alléger les diagrammes, les routes de l'API y sont écrites sans leur préfixe `/v1`.

## 1. Acteurs

| Acteur | Nom dans le code | Type | Description |
|---|---|---|---|
| **Exploitant** | rôle `operator` | Humain | Supervise le parc et le pilote (envoie des consignes) |
| **Lecteur** | rôle `viewer` | Humain | Consulte les données, sans droit de pilotage |
| **Objet** | `device` | Système | ESP32 du site, simulé dans Wokwi : publie les mesures, applique les consignes |
| **Simulateur** | `simulator` | Système | Script qui publie les mesures des 20 panneaux |
| **Service de notifications Expo** | — | Système externe | Achemine les notifications push vers les téléphones |
| **Planificateur** | `scheduler` | Interne à l'API | Tâches périodiques : délais de réponse aux consignes, détection d'objet silencieux |

L'**Exploitant** hérite de toutes les capacités du **Lecteur**.

## 2. Cas d'utilisation

```mermaid
flowchart LR
  viewer(["Lecteur"])
  operator(["Exploitant"])
  device(["Objet ESP32"])
  simulator(["Simulateur"])
  expo(["Service de notifications Expo"])

  subgraph app["Système de supervision et de pilotage"]
    UC01["UC01 Se connecter"]
    UC02["UC02 Se déconnecter"]
    UC03["UC03 Consulter la supervision"]
    UC04["UC04 Consulter la carte"]
    UC05["UC05 Consulter le détail d'un panneau"]
    UC06["UC06 Consulter l'historique du site"]
    UC07["UC07 Envoyer une consigne"]
    UC08["UC08 Consulter l'historique des consignes"]
    UC09["UC09 Consulter les alertes"]
    UC10["UC10 Recevoir une notification"]
    UC11["UC11 Publier les mesures du site"]
    UC12["UC12 Appliquer une consigne"]
    UC13["UC13 Signaler sa présence"]
    UC14["UC14 Publier les mesures des panneaux"]
    UC17["UC17 Positionner ou corriger un panneau"]
  end

  viewer --- UC01 & UC02 & UC03 & UC04 & UC05 & UC06 & UC08 & UC09 & UC10
  operator -. hérite de .-> viewer
  operator --- UC07 & UC17
  device --- UC11 & UC12 & UC13
  simulator --- UC14
  UC10 --- expo
```

| ID | Cas d'utilisation | Acteur principal | Résumé | Priorité |
|---|---|---|---|---|
| UC01 | Se connecter | Lecteur | Saisie de l'e-mail et du mot de passe, obtention d'un jeton, enregistrement du jeton de notification du téléphone | Socle |
| UC02 | Se déconnecter | Lecteur | Suppression du jeton local et du jeton de notification côté API | Socle |
| UC03 | Consulter la supervision | Lecteur | Production, batterie, répartition actuelle, mode, statut de l'objet, nombre d'alertes | Socle |
| UC04 | Consulter la carte | Lecteur | Panneaux positionnés et colorés selon leur statut | Socle |
| UC05 | Consulter le détail d'un panneau | Lecteur | Dernières valeurs et historique d'un panneau | Socle |
| UC06 | Consulter l'historique du site | Lecteur | Graphiques de production, batterie et flux sur une période | Socle |
| UC07 | Envoyer une consigne | Exploitant | Choix du mode et de la répartition, confirmation, suivi de l'application | Socle |
| UC08 | Consulter l'historique des consignes | Lecteur | Liste des consignes : auteur, demande, résultat | Socle |
| UC09 | Consulter les alertes | Lecteur | Alertes actives et résolues | Socle |
| UC10 | Recevoir une notification | Lecteur | Notification push à l'ouverture d'une alerte `warning` ou `critical` | Socle |
| UC11 | Publier les mesures du site | Objet | Toutes les 5 s | Socle |
| UC12 | Appliquer une consigne | Objet | Application avec limites de sécurité, réponse avec l'état appliqué | Socle |
| UC13 | Signaler sa présence | Objet | Statut `online` à la connexion, `offline` via le Last Will | Socle |
| UC14 | Publier les mesures des panneaux | Simulateur | Toutes les 10 s par panneau ; un code inconnu crée un panneau non positionné | Socle |
| UC15 | Consulter la vue 3D | Lecteur | Panneaux en 3D colorés par statut | Bonus |
| UC16 | Piloter l'orientation des panneaux | Exploitant | Mode automatique ou position de sécurité du tracker | Bonus |
| UC17 | Positionner ou corriger un panneau | Exploitant | Placer un panneau détecté à la position GPS du téléphone, corriger son nom ou sa puissance, le supprimer | Socle |
| UC18 | Ajouter un panneau sur le terrain | Exploitant | Scanner le QR code d'un panneau, capter la position, enregistrer | Bonus |

### Description détaillée de UC07 « Envoyer une consigne »

| Rubrique | Contenu |
|---|---|
| Acteur | Exploitant |
| Préconditions | Utilisateur connecté avec le rôle `operator` ; téléphone connecté au réseau ; objet du site `online` |
| Déclencheur | L'utilisateur ouvre l'écran Pilotage et modifie le mode ou la répartition |
| Scénario nominal | 1. L'utilisateur choisit le mode. 2. En mode manuel, il règle la part batterie (pas de 10 %). 3. Il appuie sur « Appliquer ». 4. L'app affiche un résumé et demande confirmation. 5. L'app envoie la consigne à l'API. 6. L'API vérifie les droits et les bornes, enregistre la consigne (`sent`), la publie sur MQTT et répond 202. 7. L'objet applique la consigne et publie son état. 8. L'API met à jour la consigne (`applied`). 9. L'app, qui interroge l'API toutes les 2 s tant que la consigne est `sent`, affiche « Appliquée ». |
| Variante A | 7a. La batterie est pleine : l'objet refuse la charge. 8a. Consigne `rejected`, raison `battery_full`, alerte `setpoint_rejected`. 9a. L'app affiche le refus et sa raison. |
| Variante B | 7b. La puissance de charge maximale est dépassée : l'objet applique une part réduite. 8b. Consigne `partial`, raison `charge_limit`. |
| Variante C | 7c. Aucune réponse en 30 s. 8c. Le planificateur passe la consigne en `no_response` et ouvre une alerte. Si une réponse arrive plus tard, la consigne prend le statut de cette réponse. |
| Exceptions | Rôle `viewer` : bouton masqué dans l'app, et 403 côté API. Objet hors ligne : pilotage désactivé dans l'app, et 409 côté API. Téléphone hors ligne : pilotage désactivé. Valeurs hors bornes : 422. |
| Postconditions | Une ligne `setpoints` existe ; la consigne est publiée en retained sur le broker ; l'historique la montre avec son résultat |

## 3. Diagramme de classes du domaine

```mermaid
classDiagram
  direction LR

  class User {
    +UUID id
    +String email
    +String name
    +UserRole role
    +canControl() bool
  }
  class PushToken {
    +UUID id
    +String token
    +MobilePlatform platform
  }
  class Site {
    +UUID id
    +String code
    +String name
    +float latitude
    +float longitude
    +int peakPowerW
    +int batteryCapacityWh
    +int maxChargePowerW
    +float productionFactor
    +expectedProductionW(irradiance) float
  }
  class Device {
    +UUID id
    +String mqttClientId
    +DeviceStatus status
    +DateTime lastSeenAt
    +String firmwareVersion
  }
  class Panel {
    +UUID id
    +String code
    +String name
    +float latitude
    +float longitude
    +int ratedPowerW
    +PanelSource source
    +isPlaced() bool
  }
  class SiteMeasurement {
    +DateTime time
    +float irradianceWm2
    +float productionW
    +float temperatureC
    +float batteryLevelPct
    +float batteryPowerW
    +float gridPowerW
    +ControlMode mode
    +bool simulatedFault
  }
  class PanelMeasurement {
    +DateTime time
    +float productionW
    +float temperatureC
  }
  class Setpoint {
    +UUID id
    +ControlMode mode
    +int requestedBatteryShare
    +SetpointStatus status
    +int appliedBatteryShare
    +RejectionReason rejectionReason
    +DateTime createdAt
    +DateTime respondedAt
  }
  class Alert {
    +UUID id
    +AlertType type
    +AlertSeverity severity
    +String message
    +AlertStatus status
    +DateTime startedAt
    +DateTime endedAt
  }

  class UserRole {
    <<enumeration>>
    operator
    viewer
  }
  class ControlMode {
    <<enumeration>>
    manual
    automatic
    discharge
  }
  class SetpointStatus {
    <<enumeration>>
    sent
    applied
    partial
    rejected
    no_response
  }

  User "1" --> "0..*" PushToken : possède
  User "1" --> "0..*" Setpoint : émet
  Site "1" --> "1..*" Device : est équipé de
  Site "1" --> "0..*" Panel : comporte
  Site "1" --> "0..*" SiteMeasurement : historique
  Panel "1" --> "0..*" PanelMeasurement : historique
  Site "1" --> "0..*" Setpoint : reçoit
  Site "1" --> "0..*" Alert : concerne
  Panel "0..1" --> "0..*" Alert : concerne
  User ..> UserRole
  Setpoint ..> ControlMode
  Setpoint ..> SetpointStatus
```

## 4. Diagrammes de séquence

### 4.1 Connexion (UC01)

```mermaid
sequenceDiagram
  autonumber
  actor U as Utilisateur
  participant App as App mobile
  participant API as API
  participant DB as Base

  U->>App: Saisit e-mail et mot de passe
  App->>API: POST /auth/login
  API->>DB: Recherche de l'utilisateur par e-mail
  alt Identifiants valides
    API->>API: Vérification argon2id, création du JWT (8 h)
    API-->>App: 200 token, expiresAt, user
    App->>App: Stockage du jeton dans expo-secure-store
    App->>App: Demande d'autorisation des notifications, obtention du jeton Expo
    App->>API: POST /push-tokens
    API->>DB: Insertion ou réattribution du jeton
    API-->>App: 204
    App-->>U: Écran Supervision
  else Identifiants invalides
    API-->>App: 401 INVALID_CREDENTIALS
    App-->>U: « E-mail ou mot de passe incorrect »
  else Trop de tentatives
    API-->>App: 429 TOO_MANY_ATTEMPTS
    App-->>U: « Trop de tentatives, réessayez dans une minute »
  end
```

### 4.2 Publication et affichage des mesures (UC11, UC03)

```mermaid
sequenceDiagram
  autonumber
  participant D as Objet ESP32
  participant B as Broker HiveMQ
  participant API as API
  participant DB as Base
  participant App as App mobile

  loop Toutes les 5 s
    D->>B: PUBLISH solar/SITE01/measurements (QoS 0)
    B->>API: Message
    API->>API: Validation du message (schéma partagé)
    alt Message valide
      API->>DB: INSERT site_measurements
      API->>DB: Mise à jour devices.last_seen_at
      API->>API: Évaluation des règles d'alerte (section 6)
    else Message invalide
      API->>API: Message ignoré, avertissement dans les logs
    end
  end

  loop Toutes les 5 s tant que l'écran est affiché
    App->>API: GET /sites/{id}
    API->>DB: Dernière mesure, consigne en vigueur, état appliqué
    API-->>App: 200
    App->>App: Mise à jour de l'écran et du stockage local
  end
```

### 4.3 Envoi et application d'une consigne (UC07, UC12)

```mermaid
sequenceDiagram
  autonumber
  actor E as Exploitant
  participant App as App mobile
  participant API as API
  participant DB as Base
  participant B as Broker HiveMQ
  participant D as Objet ESP32

  E->>App: Mode manuel, 70 % vers la batterie, « Appliquer »
  App-->>E: Demande de confirmation
  E->>App: Confirme
  App->>API: POST /sites/{id}/setpoints
  API->>API: Vérification JWT, rôle operator, bornes
  API->>DB: Objet du site en ligne ?
  alt Objet hors ligne
    API-->>App: 409 DEVICE_OFFLINE
  else Objet en ligne
    API->>DB: INSERT setpoints (status sent)
    API->>B: PUBLISH solar/SITE01/setpoint (QoS 1, retained)
    API->>API: Délai de réponse de 30 s armé
    API-->>App: 202 setpoint
    B->>D: Consigne
    D->>D: Application avec limites de sécurité (section 7)
    D->>B: PUBLISH solar/SITE01/state (QoS 1, retained)
    B->>API: État appliqué
    API->>DB: UPDATE setpoints (status, applied_battery_share, rejection_reason, responded_at)
    opt Statut rejected
      API->>DB: INSERT alerts setpoint_rejected
    end
    loop Toutes les 2 s tant que la consigne est sent (60 s au plus)
      App->>API: GET /sites/{id}
      API-->>App: consigne en vigueur et état appliqué
    end
    App-->>E: « Appliquée », « Appliquée en partie » ou « Refusée : batterie pleine »
  end
```

### 4.4 Objet hors ligne puis reconnexion (UC13)

```mermaid
sequenceDiagram
  autonumber
  participant D as Objet ESP32
  participant B as Broker HiveMQ
  participant API as API
  participant DB as Base
  participant X as Service Expo

  D->>B: CONNECT avec Last Will solar/SITE01/status = offline (retained)
  D->>B: PUBLISH solar/SITE01/status = online (retained)
  B->>API: Statut online
  API->>DB: devices.status = online

  Note over D,B: Coupure réseau de l'objet
  B->>API: Last Will : statut offline
  API->>DB: devices.status = offline
  API->>DB: INSERT alerts device_offline
  API->>X: Notification « L'objet du site SITE01 est hors ligne »

  Note over D,B: Retour du réseau
  D->>B: CONNECT, abonnement à solar/SITE01/setpoint
  B->>D: Dernière consigne retained
  D->>D: Application de la consigne en vigueur
  D->>B: PUBLISH statut online et état appliqué
  B->>API: Statut et état
  API->>DB: devices.status = online, alerte device_offline résolue
```

Si le Last Will n'arrive pas (cas d'une connexion qui reste ouverte sans trafic), le **planificateur** passe l'objet en `offline` lorsqu'aucun message n'a été reçu depuis **60 s**.

### 4.5 Ouverture d'une alerte et notification (UC10)

```mermaid
sequenceDiagram
  autonumber
  participant API as API
  participant DB as Base
  participant X as Service Expo
  participant App as App mobile

  API->>API: Une règle d'alerte se déclenche
  API->>DB: Alerte active du même type déjà ouverte ?
  alt Aucune alerte active
    API->>DB: INSERT alerts (active)
    opt Gravité warning ou critical
      API->>DB: Lecture des jetons push de tous les utilisateurs
      API->>X: Envoi groupé des notifications
      X-->>App: Notification
    end
  else Alerte déjà active
    API->>API: Rien à faire (pas de doublon)
  end
```

### 4.6 Détection puis positionnement d'un panneau (UC14, UC17)

```mermaid
sequenceDiagram
  autonumber
  participant S as Simulateur
  participant B as Broker HiveMQ
  participant API as API
  participant DB as Base
  actor E as Exploitant
  participant App as App mobile

  S->>B: PUBLISH solar/SITE01/panels/P21/measurements
  B->>API: Mesure du panneau P21
  API->>DB: Panneau P21 connu sur SITE01 ?
  alt Panneau inconnu et limite par site non atteinte
    API->>DB: INSERT panels (code P21, name P21, source discovered, sans position, 200 W)
    API->>DB: INSERT panel_measurements
  else Limite par site atteinte
    API->>API: Message ignoré, avertissement dans les logs
  end

  E->>App: Carte, vue Liste, section « Panneaux à positionner »
  App->>API: GET /sites/{id}/panels
  API-->>App: P21 avec placed = false
  E->>App: Se place devant le panneau, « Placer ici »
  App->>App: Position GPS du téléphone (expo-location)
  App->>API: PATCH /panels/{id} (latitude, longitude, éventuellement name et ratedPowerW)
  API->>API: Vérification du rôle operator et des bornes
  API->>DB: UPDATE panels
  API-->>App: 200 panneau positionné
  App-->>E: P21 apparaît sur la carte
```

Un panneau supprimé par erreur réapparaît comme « détecté » à sa prochaine mesure : c'est voulu, la suppression sert à retirer un panneau qui ne publie plus.

## 5. Diagrammes d'états

### 5.1 Consigne (`setpoint_status`)

```mermaid
stateDiagram-v2
  [*] --> sent : création par l'API
  sent --> applied : état reçu, demande appliquée en entier
  sent --> partial : état reçu, part réduite
  sent --> rejected : état reçu, rien appliqué
  sent --> no_response : aucun état après 30 s
  no_response --> applied : réponse tardive
  no_response --> partial : réponse tardive
  no_response --> rejected : réponse tardive
  applied --> [*]
  partial --> [*]
  rejected --> [*]
```

Le statut d'une consigne reflète **la première réponse** de l'objet. Ce qui se passe ensuite (par exemple la batterie qui devient pleine une heure plus tard) n'est pas reporté sur la consigne : c'est visible dans l'**état appliqué courant** du site, affiché sur l'écran Pilotage.

Une réponse est rattachée à une consigne par son identifiant (`setpointId`). Une réponse dont l'identifiant ne correspond pas à la consigne en vigueur met à jour l'état appliqué courant, mais pas le statut des consignes.

### 5.2 Objet (`device_status`)

```mermaid
stateDiagram-v2
  [*] --> unknown
  unknown --> online : premier message reçu
  online --> offline : Last Will reçu ou silence de 60 s
  offline --> online : statut online ou message reçu
```

### 5.3 Alerte (`alert_status`)

```mermaid
stateDiagram-v2
  [*] --> active : condition de déclenchement remplie
  active --> resolved : condition de résolution remplie
  resolved --> [*]
```

Une alerte résolue n'est jamais rouverte : si la condition réapparaît, une **nouvelle** alerte est créée.

## 6. Règles d'alerte

Évaluées par l'API à la réception de chaque message, ou par le planificateur. Les seuils de résolution diffèrent des seuils de déclenchement (hystérésis), pour éviter qu'une alerte s'ouvre et se ferme en boucle. Les messages sont rédigés **en français**, car ils sont affichés tels quels dans l'app.

| Type | Déclenchement | Résolution | Gravité | Portée | Message (modèle) |
|---|---|---|---|---|---|
| `low_production` | Ensoleillement > 100 W/m² **et** production < 70 % de la production attendue, en continu pendant 60 s | Production ≥ 80 % de l'attendue, ou ensoleillement ≤ 100 W/m² | `warning` | Site ou panneau | « Production basse sur {nom} : {x} W au lieu de {y} W attendus » |
| `overheating` | Température > 75 °C | Température < 70 °C | `critical` | Site ou panneau | « Surchauffe sur {nom} : {t} °C » |
| `battery_low` | Niveau ≤ 20 % | Niveau ≥ 25 % | `warning` | Site | « Batterie faible sur {site} : {n} % » |
| `battery_full` | Niveau ≥ 95 % | Niveau ≤ 90 % | `info` | Site | « Batterie pleine sur {site} : la charge est suspendue » |
| `setpoint_rejected` | Consigne passée en `rejected` | Nouvelle consigne envoyée sur le site | `warning` | Site | « Consigne refusée sur {site} : {raison} » |
| `setpoint_no_response` | Consigne passée en `no_response` | Réponse reçue ou nouvelle consigne | `critical` | Site | « L'objet du site {site} ne répond pas à la consigne » |
| `device_offline` | Objet passé en `offline` | Objet de nouveau `online` | `critical` | Site | « L'objet du site {site} est hors ligne » |

**Calculs :**

```
expected production of a site  = irradiance_w_m2 × sites.production_factor
expected production of a panel = irradiance_w_m2 × panels.rated_power_w / 1000
```

L'ensoleillement utilisé pour les panneaux est celui de la **dernière mesure du site** (les panneaux simulés n'ont pas de capteur d'ensoleillement).

**Statut d'un panneau sur la carte** (calculé par l'API, non stocké) :

| Statut | Condition | Rendu sur la carte |
|---|---|---|
| `normal` | Aucune alerte active sur le panneau, mesure reçue depuis moins de 60 s | Vert, icône « validé » |
| `alert` | Au moins une alerte active sur le panneau | Orange ou rouge selon la gravité, icône « attention » |
| `no_data` | Aucune mesure depuis 60 s | Gris, icône « déconnecté » |

Un panneau **non positionné** (sans latitude ni longitude) a l'un de ces statuts, mais n'apparaît pas sur la carte : il est listé dans la section « Panneaux à positionner » de la vue Liste.

## 7. Algorithme de pilotage de l'objet

Exécuté par l'ESP32 **chaque seconde**. Le temps de la batterie est accéléré d'un facteur 60 (1 s réelle = 1 min simulée) pour que la démo soit visible : passer de 20 % à 95 % de charge prend environ 2 à 3 minutes réelles.

Notations : `P` production (W), `level` niveau de batterie (%), `share` part vers la batterie (%), `Pbat` puissance vers la batterie (W), `Pgrid` puissance vers le réseau (W), `Pmax` puissance de charge maximale (W).

```mermaid
flowchart TD
  start(["Tick d'une seconde"]) --> read["Lire P et level"]
  read --> mode{"Mode en vigueur ?"}

  mode -- automatic --> auto{"level < 80 % ?"}
  auto -- oui --> a100["share = 100 %"]
  auto -- non --> a0["share = 0 %"]
  a100 --> full
  a0 --> full

  mode -- manual --> man["share = part demandée"]
  man --> full

  full{"share > 0 et level ≥ 95 % ?"}
  full -- oui --> rejfull["share = 0, reason = battery_full"]
  full -- non --> calc["Pbat = P × share / 100"]
  calc --> limit{"Pbat > Pmax ?"}
  limit -- oui --> capped["Pbat = Pmax, reason = charge_limit"]
  limit -- non --> ok["reason = aucune"]
  rejfull --> flows
  capped --> flows
  ok --> flows
  flows["Pgrid = P − Pbat"] --> update

  mode -- discharge --> dis{"level > 20 % ?"}
  dis -- oui --> disch["Pbat = − Pmax, Pgrid = P + Pmax"]
  dis -- non --> stop["Pbat = 0, Pgrid = P, reason = battery_low"]
  disch --> update
  stop --> update

  update["level += Pbat × 1 s × 60 / 3600 / capacité × 100, borné entre 0 et 100"] --> outputs["Relais charge = Pbat > 0, relais injection = Pgrid > 0, barre de LED = level"]
  outputs --> changed{"Part appliquée ou raison modifiée ?"}
  changed -- oui --> publish["Publier l'état (retained)"]
  changed -- non --> finish(["Fin du tick"])
  publish --> finish
```

**Statut renvoyé à la réception d'une consigne** (premier état publié après réception) :

| Situation | `status` | `appliedBatteryShare` | `reason` |
|---|---|---|---|
| Consigne mal formée ou hors bornes | `rejected` | `null` | `invalid_setpoint` |
| Manuel ou automatique, demande appliquée en entier | `applied` | part appliquée | `null` |
| Manuel, part réduite par la puissance de charge maximale | `partial` | part effective (arrondie à l'entier) | `charge_limit` |
| Manuel avec part > 0, batterie ≥ 95 % | `rejected` | 0 | `battery_full` |
| Restitution avec batterie ≤ 20 % | `rejected` | `null` | `battery_low` |
| Restitution avec batterie > 20 % | `applied` | `null` | `null` |

Quand la production est nulle (nuit), la part demandée est considérée comme appliquée : la répartition est respectée, les flux sont simplement à zéro.
