# D027 · Authentification de l'objet par certificat client, délivré à l'exécution par enrôlement

| | |
|---|---|
| **Date** | 2026-11-23 |
| **Statut** | Proposée |
| **Décideurs** | À compléter |
| **Liens** | Milestone « Sécurité de l'objet » (#80 à #84) · [D023](D023-broker-mosquitto-auto-heberge.md) · [D024](D024-objet-simule-et-connexion-wokwi.md) · Issue #65 · [UML, section 4.7](../../conception/02-uml.md) · [Cartographie, sections 1 et 6.3](../../conception/03-cartographie-technique.md) |

## Contexte

Aujourd'hui ([D023](D023-broker-mosquitto-auto-heberge.md)), l'objet se connecte au broker en TLS avec un identifiant et un mot de passe propres (`device-site01`), écrits dans `secrets.h`. Deux limites :

- **Wokwi est public.** Un projet partagé sur wokwi.com expose tous ses fichiers : un secret écrit dans le firmware (mot de passe, clé privée) devient lisible par tous.
- **Un objet volé ne se retire pas proprement.** Il faut changer le mot de passe à la main, sans trace de quel objet a été retiré ni pourquoi.

La sécurité n'est pas un bonus : c'est une **condition pour considérer le projet comme réalisé**. Le binôme fixe la cible suivante : chaque objet est authentifié par **son propre certificat client** (comme une clé SSH, sans mot de passe), le broker n'accepte que les certificats émis par le projet et non révoqués, et aucun secret ne figure dans le code de l'objet.

## Options étudiées

| Critère | Identifiant et mot de passe par objet (actuel) | Certificat client écrit dans le firmware | Certificat client délivré à l'exécution par enrôlement |
|---|---|---|---|
| Secret dans le code ou le projet Wokwi | Oui (mot de passe) | Oui (clé privée) | **Non** : la clé privée est générée sur l'objet |
| Révocation d'un objet volé | Changer le mot de passe à la main | Liste de révocation | Liste de révocation, déclenchée depuis l'app |
| Preuve d'identité de l'objet | Connaissance d'un secret partagé | Possession de la clé privée | Possession de la clé privée, validée une fois par l'exploitant |
| Complexité | Faible (en place) | Moyenne | Élevée : service d'enrôlement, autorité de certification, validation |
| Bibliothèques de l'ESP32 | `PubSubClient` + `WiFiClientSecure` | Idem, avec `setCertificate` et `setPrivateKey` | Idem, plus génération de clé et de demande de certificat (mbedTLS, fourni) |
| Intérêt pour le module (sécurité des objets connectés) | Faible | Moyen | Fort : enrôlement, cycle de vie d'un certificat, révocation |

## Décision

Retenu, **dans le socle** (milestone « Sécurité de l'objet ») : chaque objet obtient **à l'exécution** un certificat client signé par l'autorité des objets du projet, par un **enrôlement** que l'exploitant valide dans l'app ; le broker exige ce certificat (TLS mutuel) et refuse les certificats révoqués. L'identifiant et le mot de passe de D023 ne servent que pendant le fil de bout en bout, le temps que l'objet publie ses premières mesures.

### Précisions sur le schéma initial

Le schéma de départ (« objet → broker MQTTS → historisation et mobile ; certificat par objet ; serveur d'enrôlement qui récupère une ID présente sur l'objet ») est précisé ainsi :

| Point du schéma | Précision retenue |
|---|---|
| « Le certificat ne doit pas paraître dans le code » | Un certificat est **public par nature**. Le secret à protéger est la **clé privée** : elle est générée par l'objet au démarrage et **ne quitte jamais l'objet**. L'objet envoie une demande de signature (CSR) contenant sa clé publique ; le service renvoie le certificat signé. |
| « Le serveur d'enrôlement récupère une ID présente sur l'objet » | Dans Wokwi, l'identifiant de l'objet (adresse MAC, numéro de série) est public : il **identifie** l'objet mais ne **prouve** rien. Une demande d'enrôlement reste donc **en attente** jusqu'à ce que l'exploitant l'accepte dans l'app, comme les panneaux à positionner ([D020](D020-inventaire-des-panneaux.md)). Une demande pour un objet déjà enrôlé ne remplace pas son certificat sans nouvelle validation. |
| « Serveur d'enrôlement, service HTTPS » | Un **module de l'API** (`enrollment`), pas un service de plus : routes HTTPS publiques pour la demande et le suivi, routes réservées au rôle `operator` pour accepter, refuser et révoquer. La clé de l'autorité des objets est détenue par l'API (volume monté, jamais dans le dépôt). |
| « Le broker accept() le certificat selon sa base de certificats » | Mosquitto ne consulte pas de base : il vérifie que le certificat est **signé par l'autorité des objets** (`cafile`) et **absent de la liste de révocation** (`crlfile`). Le nom commun du certificat sert d'identifiant MQTT (`use_identity_as_username`), donc les droits par topic (ACL) restent ceux de D023. |
| « En cas de vol, révocation du certificat » | L'exploitant révoque l'objet dans l'app ; l'API ajoute le certificat à la liste de révocation et fait recharger Mosquitto. La liste n'est lue qu'à l'établissement de la connexion : une connexion déjà ouverte doit être coupée (redémarrage du listener ou plugin de sécurité dynamique de Mosquitto). |
| « Historisation / mobile en pub/sub WebSocket » | Seuls **l'objet, l'API et le simulateur** parlent au broker. Le **mobile n'y accède jamais** : il passe par l'API REST avec son JWT ([D010](D010-api-rest-fastify.md)), le temps réel éventuel venant de l'API (SSE, bonus). Les droits par rôle restent vérifiés à un seul endroit. |
| « = SSH » | Même principe d'authentification par clé, avec une différence : le broker ne tient pas une liste de clés autorisées comme `authorized_keys`, il fait confiance à une **autorité** qui signe les certificats, et une liste de révocation retire un objet. |
| Authentification du serveur | L'objet vérifie le certificat du broker **et** celui du service d'enrôlement avec le certificat de l'autorité du projet, embarqué dans le firmware (public, ce n'est pas un secret). |
| API et simulateur | Ils restent sur l'écoute locale 1883 (127.0.0.1) avec identifiant et mot de passe ; seule l'écoute TLS 8883, exposée par le tunnel, exige un certificat client. En mode objet du site, le simulateur suit le même enrôlement que l'objet, sur 8883, pour tester le parcours sans Wokwi. |

## Justification

C'est la seule option qui ne laisse **aucun secret** dans un projet Wokwi public : ce qui figure dans le code (certificat de l'autorité, identifiant de l'objet, adresse du service) est public par nature. La validation par l'exploitant compense le fait que l'identifiant ne prouve rien. La révocation donne une réponse précise au vol d'un objet. Le mécanisme réutilise ce qui existe déjà : TLS et ACL de Mosquitto, rôles de l'API, logique « en attente puis validé » des panneaux. Sa complexité est assumée puisque la sécurité de l'objet conditionne la réussite du projet ; elle est planifiée après le fil de bout en bout, qui la rend testable, et avant la livraison.

## Conséquences

- D023 s'applique pendant le fil de bout en bout ; à la fin de la milestone « Sécurité de l'objet », cette fiche la remplace pour l'objet et le mot de passe de `device-site01` est supprimé.
- Mise en œuvre (issues #80 à #84 de `04-besoins-fonctionnels.md`) :
  - modèle de données : une table des objets enrôlés (identifiant matériel, statut `pending` / `active` / `revoked`, empreinte et numéro de série du certificat, dates), via le skill `db-change` ;
  - API : module `enrollment` et ses routes, ajoutées à la section 7 de la cartographie ; génération de la liste de révocation et rechargement de Mosquitto ;
  - broker : écoute 8883 avec `require_certificate true`, `use_identity_as_username true`, `crlfile` ; autorité des objets générée par `pnpm mqtt:setup` ;
  - app : écran ou section « Objets » pour accepter, refuser et révoquer, réservé à l'exploitant ;
  - simulateur : même parcours en mode objet du site ;
  - firmware : génération de la clé et de la demande de certificat (mbedTLS), enrôlement au démarrage s'il n'a pas de certificat valide, puis connexion MQTT avec le certificat.
- **Wokwi** : si la simulation ne conserve pas la mémoire flash d'un lancement à l'autre (à vérifier), l'objet régénère sa clé à chaque lancement et doit être validé de nouveau. C'est acceptable pour la démonstration (le parcours d'enrôlement est montré à chaque fois) ; pour limiter les certificats orphelins, ils sont de **courte durée** et un nouvel enrôlement révoque le précédent.
- Risques : la clé de l'autorité des objets devient le secret le plus sensible du projet ; un objet compromis avant sa révocation garde ses droits jusqu'à la coupure de sa connexion.

## Sources

- Documentation de Mosquitto, `mosquitto.conf` : options `require_certificate`, `use_identity_as_username`, `crlfile` — https://mosquitto.org/man/mosquitto-conf-5.html
- Documentation de Wokwi, accès réseau de l'ESP32 — https://docs.wokwi.com/guides/esp32-wifi
