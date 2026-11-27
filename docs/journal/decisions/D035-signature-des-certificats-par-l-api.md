# D035 · Signature des certificats des objets par l'API, base de données comme référence

| | |
|---|---|
| **Date** | 2026-11-27 |
| **Statut** | Proposée (à valider par le binôme à la relecture de #81) |
| **Décideurs** | Le binôme |
| **Liens** | Issue [#81](https://github.com/SamuelLnds/proj-app-mobile-co/issues/81) · Précise [D027](D027-certificat-objet-et-enrolement.md) · [Modèle de données, `device_enrollments`](../../conception/01-modele-donnees.md) · [UML, 4.7 et 5.4](../../conception/02-uml.md) · [Cartographie, sections 5.2, 7 et 9](../../conception/03-cartographie-technique.md) |

## Contexte

[D027](D027-certificat-objet-et-enrolement.md) fixe le parcours d'enrôlement et confie la signature à l'API. #80 a mis en place l'autorité des objets (clé P-256 et base OpenSSL dans `infra/mosquitto/device-ca/`), l'ACL des objets et la liste de révocation lues par le broker. Restent à choisir : l'outil qui signe, la référence de l'état des certificats, et le comportement face à deux demandes pour le même objet.

## Options étudiées

| Critère | OpenSSL lancé par l'API (conteneur ou binaire) | `node-forge` | `@peculiar/x509` (retenue) |
|---|---|---|---|
| Clés ECDSA P-256 (celles de l'ESP32) | Oui | **Non** (RSA seulement pour les certificats) | Oui, par WebCrypto (fourni par Node) |
| Liste de révocation | Oui (`openssl ca -gencrl`) | Non | Oui (`X509CrlGenerator`) |
| Dépendance à l'exécution | Docker ou OpenSSL sur la machine de l'API ; sortie texte à analyser | Aucune | Aucune (TypeScript pur, licence MIT) |
| Tests | Lents (un conteneur par signature) | Rapides | Rapides, sans réseau ni Docker |
| État des certificats | Fichier `index.txt` d'OpenSSL, à synchroniser avec la base | Base | Base |

| Critère | Deux demandes pour le même objet : refuser la seconde (retenue) | Remplacer la première |
|---|---|---|
| Objet légitime remis à zéro (nouvelle clé dans Wokwi) | Doit attendre le refus de l'ancienne demande par l'exploitant ou son expiration (30 min) | Passe aussitôt |
| Tiers qui envoie des demandes au nom de l'objet | Ne peut pas évincer la demande légitime | Peut l'évincer sans cesse, l'exploitant ne voit jamais la bonne |
| Lisibilité pour l'exploitant | Une seule demande à comparer | La demande affichée peut changer pendant la comparaison |

## Décision

- **L'API signe** les certificats des objets et la liste de révocation avec `@peculiar/x509`, à partir du certificat et de la clé de l'autorité des objets (`DEVICE_CA_CERT_PATH`, `DEVICE_CA_KEY_PATH`). La clé est lue au moment de signer ; elle n'est ni en base, ni dans les logs, ni montée dans le broker.
- **La base fait foi** (table `device_enrollments`) : l'ACL des objets est regénérée à partir des certificats `active`, la liste de révocation à partir des certificats `revoked`, à chaque changement et au démarrage de l'API, puis le broker est rechargé par `BROKER_RELOAD_COMMAND`. La base OpenSSL de #80 (`index.txt`) ne sert plus qu'à `pnpm mqtt:check-devices`.
- **Seul un objet connu** (`devices.mqtt_client_id`) peut être demandé ; le nom commun du certificat est celui de l'objet en base, jamais celui écrit dans le CSR.
- **Une seconde demande d'une autre clé pour le même objet est refusée** (`409 ENROLLMENT_PENDING`) tant que la première est en attente ; la même demande renvoyée (même empreinte) reçoit la réponse de la première.
- Numéro de série aléatoire de 128 bits ; durée choisie à l'acceptation, de 1 h à `DEVICE_CERT_MAX_TTL_H`, `DEVICE_CERT_DEFAULT_TTL_H` par défaut ; extensions `basicConstraints CA:FALSE`, `keyUsage digitalSignature`, `extendedKeyUsage clientAuth` (comme `device-ca.cnf`).
- Si le broker ne peut pas être rechargé, la décision reste enregistrée et l'API répond `503 BROKER_UNAVAILABLE` : l'exploitant sait que la révocation n'est pas encore appliquée.

## Justification

`node-forge` ne sait pas signer avec une clé P-256, celle que l'ESP32 génère avec mbedTLS. Appeler OpenSSL imposerait Docker ou un binaire à l'API, des tests lents, et deux sources de vérité (base et `index.txt`) à garder d'accord. `@peculiar/x509` couvre la lecture du CSR, la vérification de sa signature, l'émission du certificat et de la liste de révocation, sans dépendance native. Regénérer les fichiers du broker depuis la base rend l'opération idempotente : un rechargement manqué est rattrapé au démarrage suivant. Refuser la seconde demande protège l'exploitant d'une substitution pendant qu'il compare l'empreinte ; le coût, attendre le refus de l'ancienne demande après une remise à zéro de Wokwi, est faible puisque l'exploitant est là pour valider.

## Conséquences

- Nouvelles dépendances de l'API : `@peculiar/x509` et le polyfill `reflect-metadata` qu'elle exige (cartographie, section 5.2).
- La bibliothèque écrit la liste de révocation sous l'étiquette PEM `CRL`, que Mosquitto (OpenSSL) refuse : **le broker ne démarre plus** avec un tel fichier. L'API produit elle-même le PEM (`X509 CRL`, fin de ligne finale) ; un test le vérifie. Constaté lors de la vérification de bout en bout de #81.
- Nouvelles variables : `DEVICE_CA_CERT_PATH`, `DEVICE_CA_KEY_PATH`, `BROKER_DEVICES_DIR`, `BROKER_RELOAD_COMMAND`, avec des valeurs par défaut pour le développement (cartographie, section 9).
- Nouveaux codes d'erreur : `ENROLLMENT_PENDING`, `INVALID_ENROLLMENT_STATE`, `INVALID_CSR`, `BROKER_UNAVAILABLE`.
- En développement, l'API lance `docker compose exec` pour recharger le broker : Docker doit tourner. Sur le VPS (#54), l'API conteneurisée aura besoin d'un autre moyen (point ouvert de D027).
- Après une remise à zéro de la simulation, l'exploitant refuse l'ancienne demande dans l'app avant que la nouvelle soit acceptée.

## Sources

- [`@peculiar/x509`](https://github.com/PeculiarVentures/x509), documentation et types de la version 3
- [`node-forge`](https://github.com/digitalbazaar/forge) : prise en charge des certificats limitée à RSA
- [RFC 5280](https://www.rfc-editor.org/rfc/rfc5280) : certificats X.509 et listes de révocation
