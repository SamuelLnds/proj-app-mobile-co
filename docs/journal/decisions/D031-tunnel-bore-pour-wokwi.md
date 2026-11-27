# D031 · ESP32 de Wokwi relié au broker par un tunnel TCP bore, en attendant le VPS

| | |
|---|---|
| **Date** | 2026-11-26 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | Issues #65, #20 · [D023](D023-broker-mosquitto-auto-heberge.md) · [D024](D024-objet-simule-et-connexion-wokwi.md) · [D028](D028-hebergement-vps.md) · [Infra, README](../../../infra/README.md) |

## Contexte

En offre gratuite, la passerelle réseau de Wokwi n'autorise que des connexions sortantes vers des services joignables depuis Internet. Le broker Mosquitto tourne sur le poste du développeur (port TLS 8883) et le VPS ([D028](D028-hebergement-vps.md)) n'existe pas encore : il faut un moyen gratuit, sans compte, d'exposer ce port.

## Options étudiées

| Critère | Tunnel bore (bore.pub) | Passerelle privée de Wokwi (Hobby) | Vrai ESP32 sur le réseau local |
|---|---|---|---|
| Coût | Gratuit, sans compte | Abonnement payant | Matériel à acheter |
| Mise en place | Un binaire, une commande | Abonnement, accès à `host.wokwi.internal` | Câblage réel |
| Port fixe | Non : attribué au hasard (option `--port` si libre) | Oui | Oui |
| Chiffrement de bout en bout | Oui, c'est le TLS du broker qui traverse le tunnel : bore ne voit que des octets chiffrés | Réseau privé | Réseau local |
| Dépendance | Service public tiers, sans garantie | Wokwi | Aucune |

## Décision

Tunnel TCP **bore** vers le port 8883 : `bore local 8883 --to bore.pub`. Le nom `bore.pub` est ajouté à `MQTT_TLS_HOSTS` pour que le certificat du broker l'inclue. L'ESP32 vérifie ce certificat avec l'autorité du projet embarquée dans `secrets.h`. Le port attribué est reporté dans `secrets.h` (`pnpm firmware:secrets --host bore.pub --port <port>`). Si le tunnel se révèle instable, le repli est la passerelle privée de Wokwi, puis le VPS.

## Justification

C'est la seule option gratuite et sans compte. Le TLS du broker protège les échanges : bore ne transporte que du trafic chiffré, et l'identifiant et le mot de passe de l'objet ne circulent jamais en clair. Un essai jetable avec un serveur TLS local a confirmé que le certificat est vérifié par le nom `bore.pub` à travers le tunnel (TLS 1.3).

## Conséquences

- Le port distant change à chaque lancement de bore : il faut regénérer `secrets.h` et recompiler (`pio run`) à chaque nouveau tunnel.
- Le broker est exposé sur Internet pendant le tunnel : mots de passe longs et aléatoires dans `infra/.env`, aucun accès anonyme (déjà le cas). N'importe qui peut tenter de se connecter au port attribué.
- Un seul émetteur pour le site : ne pas lancer le simulateur en mode objet du site (`SIMULATE_DEVICE=true`) quand l'ESP32 est connecté.
- Le tunnel disparaît avec le VPS ([D028](D028-hebergement-vps.md)) : l'hôte devient le nom de domaine du VPS.
- Le critère « testé par l'autre membre du binôme » de #65 reste à vérifier.

## Sources

- <https://github.com/ekzhang/bore>
- <https://docs.wokwi.com/guides/esp32-wifi>
