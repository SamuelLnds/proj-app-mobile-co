# Infrastructure de développement

Services du Docker Compose (`infra/docker-compose.yml`), lancés depuis la racine du dépôt.

| Service | Rôle                                                                                       | Port sur la machine                                    | Préparation                                 |
| ------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------- |
| `db`    | PostgreSQL + TimescaleDB                                                                   | `DB_PORT` (5432)                                       | copier `infra/.env.example` en `infra/.env` |
| `mqtt`  | Broker Mosquitto ([D023](../docs/journal/decisions/D023-broker-mosquitto-auto-heberge.md)) | `127.0.0.1:MQTT_PORT` (1883), `MQTTS_PORT` (8883, TLS) | `pnpm mqtt:setup`                           |

`pnpm dev` démarre `db` et `mqtt`, puis l'API et le simulateur. Le fichier `infra/.env` n'est jamais versionné.

## Alertes sur le téléphone

Les alertes `warning` et `critical` arrivent app fermée par le **push Expo** (Firebase Cloud Messaging sur Android, [D030](../docs/journal/decisions/D030-notifications-push-expo-et-locales.md)) : aucun service d'infrastructure n'est nécessaire, l'API envoie directement au service Expo. La configuration Firebase se fait une seule fois par le développeur, voir [`apps/mobile/README.md`](../apps/mobile/README.md). La variable facultative `EXPO_ACCESS_TOKEN` de `apps/api/.env` renforce la sécurité du compte Expo.

## Relier l'ESP32 de Wokwi au broker (tunnel bore)

L'ESP32 simulé par Wokwi (offre gratuite) ne joint que des services accessibles depuis Internet. Tant que le VPS n'existe pas, on expose le port TLS du broker avec un tunnel TCP **bore** ([D031](../docs/journal/decisions/D031-tunnel-bore-pour-wokwi.md)). Le chiffrement reste celui du broker : bore ne transporte que du trafic TLS.

1. **Installer bore** : télécharger l'archive de votre système sur la [page des releases officielles](https://github.com/ekzhang/bore/releases) (par exemple `bore-v0.6.0-x86_64-pc-windows-msvc.zip`), extraire `bore` (ou `bore.exe`) et le placer dans un dossier du `PATH`.
2. **Autoriser le nom du tunnel** : dans `infra/.env`, `MQTT_TLS_HOSTS=localhost,bore.pub`, puis `pnpm mqtt:setup` et `docker compose -f infra/docker-compose.yml up -d --force-recreate mqtt`. Une seule fois : le certificat du broker doit contenir `bore.pub`, sinon l'ESP32 le refuse.
3. **Lancer le tunnel** (broker démarré, port `MQTTS_PORT`, 8883 par défaut) : `bore local 8883 --to bore.pub`. bore affiche `listening at bore.pub:<port>`. Le port est attribué au hasard ; `--port <port>` en demande un précis s'il est libre (utile pour ne pas recompiler à chaque fois). Laisser le terminal ouvert : fermer le tunnel coupe l'objet.
4. **Reporter le port** dans le firmware : `pnpm firmware:secrets --host bore.pub --port <port>` (génère `firmware/site-device/include/secrets.h`, voir le [README du firmware](../firmware/site-device/README.md)), puis `pio run` dans `firmware/site-device`.
5. **Vérifier depuis l'extérieur** : un client MQTT en TLS sur `bore.pub:<port>`, identifiant `device-site01`, mot de passe `MQTT_DEVICE_PASSWORD`, certificat de l'autorité `infra/mosquitto/generated/ca.crt`, par exemple `mosquitto_sub -h bore.pub -p <port> --cafile infra/mosquitto/generated/ca.crt -u device-site01 -P <mot de passe> -t "solar/SITE01/status" -v`.

À savoir :

- **Un seul émetteur pour le site** : quand l'ESP32 est connecté, ne pas lancer le simulateur en mode objet du site (`SIMULATE_DEVICE=true`), sinon deux objets publient les mesures de `SITE01`.
- Tant que le tunnel est ouvert, le port est joignable par n'importe qui sur Internet : seuls les mots de passe et le TLS protègent le broker. Fermer le tunnel (Ctrl+C) dès que la démonstration est finie.
- Si le tunnel est instable, le repli est la passerelle privée de Wokwi (abonnement Hobby) ou un vrai ESP32 ; le noter alors dans le journal.
