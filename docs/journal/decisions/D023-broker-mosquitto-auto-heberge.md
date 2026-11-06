# D023 · Broker : Mosquitto auto-hébergé, ESP32 de Wokwi relié par tunnel

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | Remplace [D008](D008-broker-hivemq-cloud.md) · Issue #11 · [Cartographie, sections 1, 5.6 et 6.3](../../conception/03-cartographie-technique.md) |

## Contexte

[D008](D008-broker-hivemq-cloud.md) retenait l'offre gratuite Serverless de HiveMQ Cloud. Au moment de créer le cluster, HiveMQ n'accepte plus de nouveau cluster Serverless : l'offre s'arrête le 31 décembre 2026 et l'alternative (Starter plan) n'offre que 15 jours d'essai, ce qui ne couvre pas la durée du projet.

La contrainte d'origine reste : en offre gratuite, l'ESP32 simulé par Wokwi n'atteint que des services joignables depuis Internet, pas la machine du développeur.

## Options étudiées

| Critère | EMQX Cloud Serverless | Mosquitto auto-hébergé + tunnel TCP pour Wokwi | Mosquitto + abonnement Wokwi Hobby | Broker public de test |
|---|---|---|---|---|
| Coût | Gratuit (quota mensuel : 1 million de minutes de session, 1 Go de trafic) | Gratuit | Environ 6 à 7 € par mois | Gratuit |
| Dépendance à un service externe | Oui (risque de fermeture, comme HiveMQ) | Seulement le tunnel, et seulement pour Wokwi | Wokwi seulement | Oui |
| Droits par client (ACL) | À vérifier sur l'offre gratuite | Oui, configurés par le projet | Oui | Non (broker partagé) |
| Intérêt pour le chapitre 3 du module (passerelles et brokers) | Faible : configuration cachée | Fort : TLS, identifiants et ACL écrits par le binôme | Fort | Nul |
| Présent dans la carte du module | Non | Oui (Mosquitto) | Oui | — |
| Contrainte | Quota de trafic si tout tourne en continu | Tunnel à lancer pour chaque session avec Wokwi | Payant | Insécurisé |

## Décision

- Broker **Mosquitto** dans le Docker Compose du projet (`infra/`), sans accès anonyme : un identifiant et des droits par client (`api`, `simulator`, `device-site01`), écoute locale sur le port 1883 publiée uniquement sur `127.0.0.1`, écoute **TLS** sur le port 8883 avec une autorité de certification propre au projet. Mots de passe hachés et certificats générés par `pnpm mqtt:setup`, jamais versionnés.
- L'ESP32 de Wokwi se connectera au port 8883 par un **tunnel TCP** gratuit ; la passerelle privée de Wokwi (abonnement Hobby) reste la solution de secours, un vrai ESP32 sur le même réseau une autre option.
- La mise en place de cette connexion est repoussée au travail sur le firmware ([D024](D024-objet-simule-et-connexion-wokwi.md)).

## Justification

C'est la solution la plus simple pour le développement (tout est local), sans dépendance à une offre cloud gratuite qui peut fermer, et elle fait pratiquer la configuration d'un broker (TLS, identifiants, ACL), au cœur du chapitre 3.

## Conséquences

- Le certificat du serveur doit contenir le nom d'hôte du tunnel (`MQTT_TLS_HOSTS`), sinon l'ESP32 le refuse ; le firmware embarque le certificat de l'autorité du projet.
- Exposé par un tunnel, le broker est visible d'Internet : TLS, identifiants et ACL sont obligatoires (c'est le cas).
- Le jour de la soutenance, le tunnel doit être lancé ; solution de secours : un mois d'abonnement Wokwi Hobby.
- Issue #11 réécrite (« Infra : broker Mosquitto auto-hébergé ») et réalisée dans le socle.
