# Infrastructure de développement

Services du Docker Compose (`infra/docker-compose.yml`), lancés depuis la racine du dépôt.

| Service | Rôle                                                                                       | Port sur la machine                                    | Préparation                                 |
| ------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------- |
| `db`    | PostgreSQL + TimescaleDB                                                                   | `DB_PORT` (5432)                                       | copier `infra/.env.example` en `infra/.env` |
| `mqtt`  | Broker Mosquitto ([D023](../docs/journal/decisions/D023-broker-mosquitto-auto-heberge.md)) | `127.0.0.1:MQTT_PORT` (1883), `MQTTS_PORT` (8883, TLS) | `pnpm mqtt:setup`                           |

`pnpm dev` démarre `db` et `mqtt`, puis l'API et le simulateur. Le fichier `infra/.env` n'est jamais versionné.

## Broker : deux écoutes, deux authentifications

| Écoute              | Clients                  | Authentification                                                                                                                   | Droits                                                     |
| ------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1883, sur 127.0.0.1 | `api`, `simulator`       | Identifiant et mot de passe (`mosquitto/generated/passwd`)                                                                         | `mosquitto/config/acl`                                     |
| 8883, TLS, exposée  | Objets (`device-site01`) | Certificat client signé par l'autorité des objets, non expiré, absent de la liste de révocation ; le nom commun sert d'identifiant | `mosquitto/devices/acl`, écrite par l'API, vide par défaut |

Dossiers produits par `pnpm mqtt:setup`, tous ignorés par Git :

| Dossier                | Contenu                                                                                             | Monté dans le broker      |
| ---------------------- | --------------------------------------------------------------------------------------------------- | ------------------------- |
| `mosquitto/generated/` | Mots de passe hachés, autorité et certificat du serveur, certificat public de l'autorité des objets | Oui, en lecture seule     |
| `mosquitto/devices/`   | ACL des objets et liste de révocation (`crl.pem`), écrites par l'API                                | Oui, en lecture seule     |
| `mosquitto/device-ca/` | **Clé de l'autorité des objets** et base OpenSSL (`index.txt`, `serial`, `crlnumber`)               | **Non** : réservé à l'API |

Après une modification de `mosquitto/devices/`, `pnpm mqtt:reload` fait relire les deux fichiers au broker (`SIGHUP`, sans couper les clients). `pnpm mqtt:check-devices` vérifie sur le broker démarré les refus (sans certificat, expiré, autre autorité, révoqué) et les droits d'un certificat valide, puis restaure les fichiers.

Problèmes connus :

- `per_listener_settings` est déprécié dans Mosquitto 2.1 et sera retiré en 3.0 : le broker l'indique au démarrage. Il reste nécessaire ici pour avoir un mot de passe sur 1883 et un certificat sur 8883 ; à revoir si l'image passe en 3.0.
- Une liste de révocation expirée ferait refuser **tous** les objets : elle est générée pour 825 jours et regénérée à chaque révocation.

## Alertes sur le téléphone

Les alertes `warning` et `critical` arrivent app fermée par le **push Expo** (Firebase Cloud Messaging sur Android, [D030](../docs/journal/decisions/D030-notifications-push-expo-et-locales.md)) : aucun service d'infrastructure n'est nécessaire, l'API envoie directement au service Expo. La configuration Firebase se fait une seule fois par le développeur, voir [`apps/mobile/README.md`](../apps/mobile/README.md). La variable facultative `EXPO_ACCESS_TOKEN` de `apps/api/.env` renforce la sécurité du compte Expo.

## Relier l'ESP32 de Wokwi au broker (tunnel bore)

L'ESP32 simulé par Wokwi (offre gratuite) ne joint que des services accessibles depuis Internet. Tant que le VPS n'existe pas, on expose le port TLS du broker avec un tunnel TCP **bore** ([D031](../docs/journal/decisions/D031-tunnel-bore-pour-wokwi.md)). Le chiffrement reste celui du broker : bore ne transporte que du trafic TLS.

1. **Installer bore** : télécharger l'archive de votre système sur la [page des releases officielles](https://github.com/ekzhang/bore/releases) (par exemple `bore-v0.6.0-x86_64-pc-windows-msvc.zip`), extraire `bore` (ou `bore.exe`) et le placer dans un dossier du `PATH`.
2. **Autoriser le nom du tunnel** : dans `infra/.env`, `MQTT_TLS_HOSTS=localhost,bore.pub`, puis `pnpm mqtt:setup` et `docker compose -f infra/docker-compose.yml up -d --force-recreate mqtt`. Une seule fois : le certificat du broker doit contenir `bore.pub`, sinon l'ESP32 le refuse.
3. **Lancer le tunnel** (broker démarré, port `MQTTS_PORT`, 8883 par défaut) : `bore local 8883 --to bore.pub`. bore affiche `listening at bore.pub:<port>`. Le port est attribué au hasard ; `--port <port>` en demande un précis s'il est libre (utile pour ne pas recompiler à chaque fois). Laisser le terminal ouvert : fermer le tunnel coupe l'objet.
4. **Reporter le port** dans le firmware : `pnpm firmware:secrets --host bore.pub --port <port>` (génère `firmware/site-device/include/secrets.h`, voir le [README du firmware](../firmware/site-device/README.md)), puis `python -m platformio run` dans `firmware/site-device` (la commande `pio` n'est souvent pas dans le `PATH`).
5. **Vérifier depuis l'extérieur** : l'écoute 8883 exige un certificat client signé par l'autorité des objets ([D027](../docs/journal/decisions/D027-certificat-objet-et-enrolement.md)). Un client sans certificat est refusé : `mosquitto_sub -h bore.pub -p <port> --cafile infra/mosquitto/generated/ca.crt -t "solar/SITE01/status"` échoue pendant la négociation TLS. Les vérifications complètes se font en local avec `pnpm mqtt:check-devices`.

À savoir :

- **Un seul émetteur pour le site** : quand l'ESP32 est connecté, ne pas lancer le simulateur en mode objet du site (`SIMULATE_DEVICE=true`), sinon deux objets publient les mesures de `SITE01`.
- Tant que le tunnel est ouvert, le port est joignable par n'importe qui sur Internet : il n'accepte que les certificats d'objet signés par le projet. Fermer le tunnel (Ctrl+C) dès que la démonstration est finie.
- **Depuis #80, l'ESP32 n'a plus de mot de passe** et ne peut plus se connecter tant que l'enrôlement n'existe pas (#81, #83) ; le simulateur joue l'objet du site en attendant.
- Si le tunnel est instable, le repli est la passerelle privée de Wokwi (abonnement Hobby) ou un vrai ESP32 ; le noter alors dans le journal.
