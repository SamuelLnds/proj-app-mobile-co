# D027 · Authentification de l'objet par certificat client, délivré à l'exécution par enrôlement

| | |
|---|---|
| **Date** | 2026-11-23 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | Milestone « Sécurité de l'objet » (#80 à #84) · [D023](D023-broker-mosquitto-auto-heberge.md) · [D024](D024-objet-simule-et-connexion-wokwi.md) · [D028](D028-hebergement-vps.md) · [UML, section 4.7](../../conception/02-uml.md) · [Cartographie, sections 1, 6.3 et 8](../../conception/03-cartographie-technique.md) |

## Contexte

Aujourd'hui ([D023](D023-broker-mosquitto-auto-heberge.md)), l'objet se connecte au broker en TLS avec un identifiant et un mot de passe propres (`device-site01`), écrits dans `secrets.h`. Deux limites :

- **Wokwi est public.** Un projet partagé sur wokwi.com expose tous ses fichiers : un secret écrit dans le firmware (mot de passe, clé privée) devient lisible par tous.
- **Un objet volé ne se retire pas proprement.** Il faut changer le mot de passe à la main, sans trace de quel objet a été retiré ni pourquoi.

La sécurité n'est pas un bonus : c'est une **condition pour considérer le projet comme réalisé**. Le binôme fixe la cible suivante : chaque objet est authentifié par **son propre certificat client** (comme une clé SSH, sans mot de passe), le broker n'accepte que les certificats émis par le projet et non révoqués, et aucun secret ne figure dans le code de l'objet.

Le laboratoire du cours « lab-secured-v3 » (enrôlement par CSR, support de séance) suit le même principe ; ses apports sont repris ci-dessous et signalés.

## Options étudiées

| Critère | Identifiant et mot de passe par objet (actuel) | Certificat client écrit dans le firmware | Certificat client délivré à l'exécution par enrôlement |
|---|---|---|---|
| Secret dans le code ou le projet Wokwi | Oui (mot de passe) | Oui (clé privée) | **Non** : la clé privée est générée sur l'objet |
| Révocation d'un objet volé | Changer le mot de passe à la main | Liste de révocation | Retrait des droits et liste de révocation, depuis l'app |
| Preuve d'identité de l'objet | Connaissance d'un secret partagé | Possession de la clé privée | Possession de la clé privée, dont l'empreinte est vérifiée par l'exploitant |
| Complexité | Faible (en place) | Moyenne | Élevée : service d'enrôlement, autorité de certification, validation |
| Bibliothèques de l'ESP32 | `PubSubClient` + `WiFiClientSecure` | Idem, avec `setCertificate` et `setPrivateKey` | Idem, plus génération de clé et de demande de certificat (mbedTLS, fourni) |
| Intérêt pour le module (sécurité des objets connectés) | Faible | Moyen | Fort : enrôlement, cycle de vie d'un certificat, révocation |

## Décision

Retenu, **dans le socle** (milestone « Sécurité de l'objet ») : chaque objet obtient **à l'exécution** un certificat client signé par l'autorité des objets du projet, par un **enrôlement** que l'exploitant valide dans l'app **en comparant l'empreinte de la clé** ; le broker exige ce certificat (TLS mutuel), n'accorde de droits qu'aux objets actifs et refuse les certificats révoqués. L'identifiant et le mot de passe de D023 ne servent que pendant le fil de bout en bout, le temps que l'objet publie ses premières mesures.

### Parcours retenu

1. **Clé et demande.** Au démarrage sans certificat valide, l'objet génère une clé P-256 en mémoire et une demande de certificat (CSR). Il affiche sur le moniteur série son nom (`device-site01`) et l'**empreinte** de sa clé publique (SHA-256 de la clé publique encodée, groupée pour la lecture). La clé privée n'est jamais affichée ni transmise.
2. **Demande en HTTPS.** `POST` vers le module `enrollment` de l'API avec le nom demandé et le CSR ; réponse `202` avec le statut `pending` et l'empreinte calculée par le serveur, rien d'autre.
3. **Décision humaine.** L'app affiche la demande (nom, empreinte, date, expiration). L'exploitant **compare l'empreinte** de l'app avec celle du moniteur série, puis accepte ou refuse. C'est l'empreinte, et non le nom, qui prouve que la bonne clé est approuvée. *(Apport du cours.)*
4. **Signature.** À l'acceptation, l'API signe le CSR avec l'autorité des objets. Le **nom commun est imposé par le serveur** (le nom approuvé) : celui écrit dans le CSR est ignoré, l'objet ne peut pas s'attribuer une identité. Durée : `DEVICE_CERT_DEFAULT_TTL_H` (8 h), au plus `DEVICE_CERT_MAX_TTL_H` (48 h), choisie à l'acceptation. *(Apport du cours.)* L'API ajoute l'objet à l'ACL du broker et le fait recharger.
5. **Suivi.** L'objet interroge l'API toutes les `ENROLLMENT_POLL_PERIOD_S` (3 s) par l'empreinte. Une fois acceptée, la réponse contient le certificat et sa date d'expiration ; l'objet vérifie que le nom commun est bien le sien et que la clé publique du certificat est la sienne, sinon il rejette la réponse. Les topics restent ceux du firmware (constantes partagées), ils ne sont pas reçus du serveur.
6. **Connexion.** TLS mutuel sur 8883 ; le nom commun devient l'identifiant MQTT (`use_identity_as_username`) et l'ACL, qui refuse tout par défaut, n'autorise que les topics du site.

Règles des demandes *(apport du cours)* : une demande en attente expire après `ENROLLMENT_PENDING_TTL_MIN` (30 min) ; deux demandes en attente pour le même nom ne coexistent pas ; aucun échange d'enrôlement ne contient de clé privée (vérifié par les tests : le mot `PRIVATE` n'apparaît dans aucune requête ni réponse).

### Révocation

Le cours révoque en retirant l'ACL et en redémarrant le broker : le certificat reste valide mais toute publication est refusée. Ce projet fait de même **et** ajoute une liste de révocation, parce que le nom commun d'un objet (`device-site01`) est réutilisé d'un enrôlement à l'autre : sans liste, l'ancien certificat d'un objet ré-enrôlé retrouverait les droits du nouveau.

| Cas | Action de l'API |
|---|---|
| Objet volé (révocation dans l'app) | Retrait de l'objet de l'ACL, certificat ajouté à la liste de révocation, rechargement du broker : publications refusées tout de suite, reconnexion refusée pendant la négociation TLS |
| Nouvel enrôlement accepté pour un objet déjà actif | Ancien certificat ajouté à la liste de révocation ; l'ACL ne change pas |
| Certificat expiré | Rien : le broker le refuse de lui-même ; l'objet refait une demande |

### Précisions sur le schéma initial

| Point du schéma | Précision retenue |
|---|---|
| « Le certificat ne doit pas paraître dans le code » | Un certificat est **public par nature**. Le secret à protéger est la **clé privée** : générée par l'objet, elle **ne quitte jamais l'objet**. |
| « Le serveur d'enrôlement récupère une ID présente sur l'objet » | Dans Wokwi, le nom ou l'identifiant matériel de l'objet est public : il **identifie** l'objet mais ne **prouve** rien. La preuve est l'**empreinte de la clé**, comparée par l'exploitant. |
| « Serveur d'enrôlement, service HTTPS » | Un **module de l'API** (`enrollment`), pas un service de plus : routes publiques pour la demande et le suivi, routes réservées au rôle `operator` (JWT) pour accepter, refuser et révoquer. La clé de l'autorité des objets est détenue par l'API (volume monté, jamais dans le dépôt). |
| « Le broker accept() le certificat selon sa base de certificats » | Mosquitto ne consulte pas de base : il vérifie que le certificat est **signé par l'autorité des objets** (`cafile`), **non expiré** et **absent de la liste de révocation** (`crlfile`), puis applique l'ACL au nom commun. |
| « Historisation / mobile en pub/sub WebSocket » | Seuls **l'objet, l'API et le simulateur** parlent au broker. Le **mobile n'y accède jamais** : il passe par l'API REST avec son JWT ([D010](D010-api-rest-fastify.md)). |
| « = SSH » | Même principe d'authentification par clé, mais le broker fait confiance à une **autorité** qui signe les certificats au lieu d'une liste de clés comme `authorized_keys`. |
| Authentification des serveurs | L'objet vérifie le broker avec le certificat de l'autorité du projet, et l'API (HTTPS par Let's Encrypt sur le VPS, [D028](D028-hebergement-vps.md)) avec la racine publique correspondante ; les deux sont embarqués dans le firmware, ce ne sont pas des secrets. L'heure NTP est synchronisée avant tout échange TLS. |
| API et simulateur | Ils restent sur l'écoute locale 1883 (127.0.0.1) avec identifiant et mot de passe ; seule l'écoute 8883, exposée sur Internet, exige un certificat client. En mode objet du site, le simulateur suit le même enrôlement que l'objet, pour tester le parcours sans Wokwi. |

## Justification

C'est la seule option qui ne laisse **aucun secret** dans un projet Wokwi public : ce qui figure dans le code (certificats d'autorité, nom de l'objet, adresse du service) est public par nature. La comparaison d'empreinte compense le fait que le nom ne prouve rien. La révocation donne une réponse précise au vol d'un objet. Le mécanisme réutilise ce qui existe déjà : TLS et ACL de Mosquitto, rôles de l'API, logique « en attente puis validé » des panneaux ([D020](D020-inventaire-des-panneaux.md)). Sa complexité est assumée puisque la sécurité de l'objet conditionne la réussite du projet ; elle est planifiée après le fil de bout en bout, qui la rend testable, et avant la livraison.

## Conséquences

- D023 s'applique pendant le fil de bout en bout ; à la fin de la milestone « Sécurité de l'objet », cette fiche la remplace pour l'objet et le mot de passe de `device-site01` est supprimé.
- Nouvelles constantes partagées : `ENROLLMENT_PENDING_TTL_MIN`, `ENROLLMENT_POLL_PERIOD_S`, `DEVICE_CERT_DEFAULT_TTL_H`, `DEVICE_CERT_MAX_TTL_H` (section 8 de la cartographie).
- Mise en œuvre (issues #80 à #84 de `04-besoins-fonctionnels.md`) :
  - broker : écoute 8883 avec `require_certificate true`, `use_identity_as_username true`, `crlfile` ; ACL qui refuse tout par défaut, écrite par l'API ; autorité des objets générée par `pnpm mqtt:setup` ;
  - modèle de données : demandes d'enrôlement et certificats (nom, empreinte, statut `pending` / `active` / `rejected` / `revoked` / `expired`, numéro de série, dates), via le skill `db-change` ;
  - API : module `enrollment` et ses routes (section 7 de la cartographie), signature, ACL, liste de révocation et rechargement du broker ;
  - app : section « Objets » pour comparer l'empreinte, accepter, refuser et révoquer, réservée à l'exploitant ;
  - simulateur : même parcours en mode objet du site ;
  - firmware : clé et CSR (mbedTLS), affichage de l'empreinte, suivi, vérification de la réponse, connexion avec le certificat.
- **Wokwi** : une remise à zéro de la simulation produit une nouvelle clé, donc une nouvelle empreinte ; l'ancienne ne vaut plus et l'exploitant valide de nouveau. C'est acceptable pour la démonstration, où le parcours d'enrôlement est montré.
- **Limites assumées** *(comme dans le cours)* : la clé est en mémoire vive, pas dans un élément sécurisé, donc un firmware modifié pourrait la divulguer ; quiconque atteint l'API peut déposer une demande, d'où l'expiration des demandes et la limitation de débit. Le rechargement exact de Mosquitto (signal `SIGHUP` ou redémarrage du conteneur) et son effet sur une connexion déjà ouverte sont à vérifier à la mise en œuvre.
- Risque principal : la clé de l'autorité des objets devient le secret le plus sensible du projet.

## Sources

- B. Boussemart, « lab-secured-v3 — enrôlement par CSR », support de cours ESPL / MyDigitalSchool, 2026 (non diffusé).
- Documentation de Mosquitto, `mosquitto.conf` : options `require_certificate`, `use_identity_as_username`, `crlfile` — https://mosquitto.org/man/mosquitto-conf-5.html
- Documentation de Wokwi, accès réseau de l'ESP32 — https://docs.wokwi.com/guides/esp32-wifi
