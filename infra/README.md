# Infrastructure de développement

Services du Docker Compose (`infra/docker-compose.yml`), lancés depuis la racine du dépôt.

| Service | Rôle                                                                                       | Port sur la machine                                    | Préparation                                 |
| ------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------- |
| `db`    | PostgreSQL + TimescaleDB                                                                   | `DB_PORT` (5432)                                       | copier `infra/.env.example` en `infra/.env` |
| `mqtt`  | Broker Mosquitto ([D023](../docs/journal/decisions/D023-broker-mosquitto-auto-heberge.md)) | `127.0.0.1:MQTT_PORT` (1883), `MQTTS_PORT` (8883, TLS) | `pnpm mqtt:setup`                           |

`pnpm dev` démarre `db` et `mqtt`, puis l'API et le simulateur. Le fichier `infra/.env` n'est jamais versionné.

## Alertes sur le téléphone

Les alertes `warning` et `critical` arrivent app fermée par le **push Expo** (Firebase Cloud Messaging sur Android, [D030](../docs/journal/decisions/D030-notifications-push-expo-et-locales.md)) : aucun service d'infrastructure n'est nécessaire, l'API envoie directement au service Expo. La configuration Firebase se fait une seule fois par le développeur, voir [`apps/mobile/README.md`](../apps/mobile/README.md). La variable facultative `EXPO_ACCESS_TOKEN` de `apps/api/.env` renforce la sécurité du compte Expo.
