# Infrastructure de développement

Services du Docker Compose (`infra/docker-compose.yml`), lancés depuis la racine du dépôt.

| Service | Rôle                                                                                               | Port sur la machine                                    | Préparation                                 |
| ------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------- |
| `db`    | PostgreSQL + TimescaleDB                                                                           | `DB_PORT` (5432)                                       | copier `infra/.env.example` en `infra/.env` |
| `mqtt`  | Broker Mosquitto ([D023](../docs/journal/decisions/D023-broker-mosquitto-auto-heberge.md))         | `127.0.0.1:MQTT_PORT` (1883), `MQTTS_PORT` (8883, TLS) | `pnpm mqtt:setup`                           |
| `ntfy`  | Serveur de notifications ([D029](../docs/journal/decisions/D029-notifications-locales-et-ntfy.md)) | `127.0.0.1:NTFY_PORT` (8090)                           | `pnpm ntfy:setup`                           |

`pnpm dev` démarre `db`, `mqtt` et `ntfy`, puis l'API et le simulateur. Le fichier `infra/.env` n'est jamais versionné.

## Alertes sur le téléphone : serveur ntfy

Une alerte `warning` ou `critical` est publiée par l'API sur un sujet ntfy ; le téléphone la reçoit **app fermée** par l'app Android ntfy, sans compte ni Firebase. Quand l'app Solar est ouverte, elle affiche en plus ses propres notifications locales.

Règles :

- Le serveur refuse tout accès sans jeton (`auth-default-access: deny-all`). **Jamais le serveur public ntfy.sh** : un sujet y est lisible par quiconque en connaît le nom.
- Sujet nommé d'après le site : `solar-<code du site en minuscules>-alerts` (par exemple `solar-site01-alerts`).
- Aucune donnée personnelle dans un message.
- Deux jetons, aucun versionné : un de **publication** (écriture seule, pour l'API) et un de **lecture** (lecture seule, pour le téléphone).

### 1. Créer le serveur et les jetons

```
pnpm ntfy:setup
```

Le script démarre ntfy au besoin, crée les utilisateurs `solar-api` et `solar-phone`, leurs droits et leurs jetons (dans `infra/ntfy/generated/`, ignoré par Git), puis **affiche les valeurs une seule fois**. Relancé, il ne change rien ; `pnpm ntfy:setup -- --rotate` crée de nouveaux jetons (les anciens cessent de fonctionner).

Recopier dans `apps/api/.env` les trois lignes affichées : `NTFY_URL`, `NTFY_TOPIC`, `NTFY_TOKEN`. Sans `NTFY_URL`, l'API démarre normalement et n'envoie rien à ntfy (un avertissement dans ses logs).

### 2. Joindre le serveur depuis le téléphone

Le port est publié sur `127.0.0.1` seulement. En développement, avec le téléphone relié en USB (débogage USB activé) :

```
adb reverse tcp:8090 tcp:8090
```

Le téléphone joint alors le serveur à l'adresse `http://localhost:8090` (le renvoi est à refaire après chaque rebranchement). Autre possibilité, sur un réseau de confiance : `NTFY_BIND=0.0.0.0` dans `infra/.env`, puis l'adresse de la machine sur le même Wi-Fi (`NTFY_BASE_URL` doit alors porter cette adresse).

### 3. Configurer l'app ntfy

1. Installer l'app **ntfy** pour Android, par F-Droid ou Google Play. Aucun compte n'est nécessaire.
2. Ajouter l'abonnement (bouton « + ») : saisir le sujet (`solar-site01-alerts`), activer « Use another server » et saisir l'adresse du serveur (`http://localhost:8090`).
3. Fournir le jeton de lecture : dans les paramètres de l'app, `Advanced` puis `Custom headers`, ajouter pour ce serveur l'en-tête `Authorization` avec la valeur `Bearer <jeton de lecture>` (contenu de `infra/ntfy/generated/read-token`, à copier sur le téléphone sans l'envoyer par un canal public).
4. Retirer l'optimisation de batterie pour l'app ntfy (`Paramètres Android`, `Applications`, `ntfy`, `Batterie`, « Sans restriction »). Sans cela, Android peut suspendre la connexion et retarder les alertes.
5. Laisser le service d'abonnement actif : l'app affiche une **notification permanente**, c'est elle qui permet la réception instantanée.

La notification d'une alerte s'affiche dans l'app ntfy (pas dans Solar) ; l'appui ouvre l'app Solar (lien `solar://`).

### 4. Vérifier à la main

```
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8090/solar-site01-alerts/json?poll=1                   # 403 : sans jeton
curl -s -H "Authorization: Bearer $(cat infra/ntfy/generated/read-token)" "http://127.0.0.1:8090/solar-site01-alerts/json?poll=1"
```

### Sur le VPS

Le serveur ntfy passe derrière Caddy en HTTPS, comme l'API ([D028](../docs/journal/decisions/D028-hebergement-vps.md)) : le port de ntfy n'est pas ouvert sur Internet, `NTFY_BASE_URL` porte l'adresse HTTPS et `NTFY_BEHIND_PROXY=true`.
