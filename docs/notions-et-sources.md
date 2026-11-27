# Notions du module et sources

Les notions des chapitres « passerelles et brokers », « sécurité » et « observer, tester, déployer », avec ce que le projet en fait. Quand une notion n'est pas utilisée, la colonne le dit.

## MQTT et brokers

| Notion | En une phrase | Dans le projet | Source |
|---|---|---|---|
| QoS 0, 1, 2 | Niveau de garantie de livraison : au plus une fois, au moins une fois, exactement une fois. | Les mesures sont en QoS 0 (une perte est sans gravité, la suivante arrive 5 s plus tard) ; les consignes et le statut en QoS 1. Le QoS 2 n'est pas utilisé. | [MQTT 3.1.1, section 4.3](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html) |
| Message retained | Le broker garde le dernier message d'un topic et le renvoie à tout nouvel abonné. | La consigne en vigueur, l'état appliqué et le statut de l'objet : un objet qui se reconnecte retrouve sa dernière consigne. | [MQTT 3.1.1, section 3.3.1.3](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html) |
| Last Will | Message que le broker publie à la place d'un client dont la connexion tombe sans prévenir. | L'objet déclare un statut `offline` à la connexion ; le broker le publie s'il disparaît brutalement. | [MQTT 3.1.1, section 3.1.2.5](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html) |
| Keepalive | Délai maximal de silence toléré entre un client et le broker avant de considérer la connexion perdue. | 60 s dans le firmware, assez large pour un Wokwi qui tourne à environ la moitié du temps réel. | [MQTT 3.1.1, section 3.1.2.10](https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/os/mqtt-v3.1.1-os.html) |
| Pont (bridge) vers un broker cloud | Un broker local relaie certains topics vers un broker distant, et inversement. | Non utilisé : un seul broker Mosquitto auto-hébergé. Un pont servirait si le site gardait son broker et remontait ses mesures vers un cloud. | [Mosquitto, section Bridges](https://mosquitto.org/man/mosquitto-conf-5.html) |
| Edge | Faire le traitement au plus près de l'objet plutôt que dans le cloud. | L'algorithme de pilotage tourne sur l'ESP32 : il continue d'appliquer la dernière consigne si le réseau tombe. | [ETSI, Multi-access Edge Computing](https://www.etsi.org/technologies/multi-access-edge-computing) |

## Sécurité

| Notion | En une phrase | Dans le projet | Source |
|---|---|---|---|
| TLS | Chiffre la connexion et prouve l'identité du serveur grâce à un certificat. | Le broker écoute en TLS sur le port 8883 avec une autorité de certification propre au projet (en TLS 1.2 ; la version actuelle du protocole est la 1.3). | [RFC 8446](https://www.rfc-editor.org/rfc/rfc8446) |
| TLS mutuel | Le client présente lui aussi un certificat : le serveur sait qui se connecte. | Prévu pour l'objet (milestone sécurité), pas encore en place : aujourd'hui l'objet s'authentifie par un mot de passe. | [RFC 8446, section 4.4.2](https://www.rfc-editor.org/rfc/rfc8446) ; [Mosquitto TLS](https://mosquitto.org/man/mosquitto-tls-7.html) |
| CSR et autorité de certification | L'objet génère sa clé et envoie une demande de signature (CSR) ; l'autorité la signe et rend un certificat, la clé privée ne sort jamais. | Prévu : l'objet génère sa clé, l'exploitant compare l'empreinte dans l'app, l'API signe. | [RFC 2986](https://www.rfc-editor.org/rfc/rfc2986) ; [RFC 5280](https://www.rfc-editor.org/rfc/rfc5280) |
| Révocation | Invalider un certificat avant son expiration, par exemple si l'objet est volé. | Prévu : liste de révocation côté broker et certificats à durée courte. | [RFC 5280, section 5 (CRL)](https://www.rfc-editor.org/rfc/rfc5280) |
| ACL | Liste des topics que chaque client a le droit de lire ou d'écrire. | En place : trois clients (API, simulateur, objet), chacun limité à ses topics, rien d'autorisé par défaut. | [Mosquitto, `acl_file`](https://mosquitto.org/man/mosquitto-conf-5.html) |
| Bonnes pratiques IoT | Référentiel européen de sécurité des objets connectés grand public : pas de mot de passe universel, mises à jour, données protégées. | Sert de grille de lecture pour le dossier de sécurité : un mot de passe écrit dans le firmware est justement ce qu'il écarte. | [ETSI EN 303 645](https://www.etsi.org/deliver/etsi_en/303600_303699/303645/02.01.01_60/en_303645v020101p.pdf) |

## Observer, tester, déployer

| Notion | En une phrase | Dans le projet | Source |
|---|---|---|---|
| Intégration continue (CI) | À chaque modification, une machine relance les vérifications automatiquement. | GitHub Actions lance lint, types et tests sur chaque pull request. | [GitHub Actions](https://docs.github.com/en/actions) |
| Mise à jour à distance (OTA) | Envoyer un nouveau firmware à l'objet par le réseau, sans le brancher. | Non utilisé : le firmware est recompilé et relancé dans Wokwi. Sur un vrai ESP32, ce serait l'OTA d'ESP-IDF, avec démarrage sécurisé pour n'accepter que du code signé. | [ESP-IDF, OTA](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/ota.html) ; [Secure Boot v2](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/security/secure-boot-v2.html) |
| Ferme d'appareils (device farm) | Un service qui exécute les tests sur de nombreux vrais téléphones. | Non utilisé : les tests se font sur le téléphone de l'équipe. | [Firebase Test Lab](https://firebase.google.com/docs/test-lab) ; [AWS Device Farm](https://aws.amazon.com/device-farm/) |
| Distribution d'un APK | Fabriquer l'application Android et la donner à des testeurs sans passer par le Play Store. | EAS Build construit l'APK dans le cloud (profil `preview`) ; l'installation se fait par lien. | [Expo, EAS Build](https://docs.expo.dev/build/introduction/) ; [distribution interne](https://docs.expo.dev/build/internal-distribution/) |
| Notifications push | Le système du téléphone affiche un message envoyé par un serveur, même app fermée. | L'API passe par le service push d'Expo, qui s'appuie sur Firebase pour Android. | [Expo, notifications push](https://docs.expo.dev/push-notifications/overview/) |
