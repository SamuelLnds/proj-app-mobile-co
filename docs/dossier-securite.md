# Dossier sécurité

Revue de sécurité de la chaîne objet → broker → API → app ([#51](conception/04-besoins-fonctionnels.md)). Pour chaque mesure : ce qui est en place, et la preuve (test, vérification sur le système réel, configuration). Puis, pour chaque thème du chapitre 6 du module (« Sécuriser la chaîne »), ce qui est fait et pourquoi ce choix. Le cœur du travail est la sécurité de l'objet ([D027](journal/decisions/D027-certificat-objet-et-enrolement.md), [D035](journal/decisions/D035-signature-des-certificats-par-l-api.md)) ; le projet ne va pas jusqu'à une démarche d'audit complète.

Vérifications du 27 novembre 2026, sur le poste de développement (Docker Desktop, Mosquitto 2.1.4), sauf mention contraire.

## 1. Actifs et menaces

| Actif | Pourquoi il compte |
|---|---|
| Pilotage de la batterie (consignes) | Une consigne malveillante pourrait vider la batterie ou la saturer |
| Identité de l'objet (clé privée, certificat) | Qui la détient publie des mesures au nom du site et reçoit ses consignes |
| Clé de l'autorité des objets | Elle permet de fabriquer un certificat d'objet accepté par le broker : c'est le secret le plus sensible |
| Comptes de l'app (e-mail, mot de passe, JWT) | Le rôle exploitant donne le pilotage et la gestion des objets |
| Mesures et alertes | Fiabilité de la supervision ; aucune donnée personnelle |

Menaces (STRIDE, simple) sur chaque maillon :

| Maillon | Usurpation (S) | Altération (T) | Répudiation (R) | Divulgation (I) | Déni de service (D) | Élévation (E) |
|---|---|---|---|---|---|---|
| Objet → broker (8883, Internet) | Faux objet : **refusé**, certificat signé par l'autorité des objets exigé | Messages modifiés : **TLS** | | Écoute : **TLS** | Inondation : droits limités par l'ACL ; pas de limite de débit sur le broker (limite) | Objet qui publie hors de ses topics : **ACL** |
| Enrôlement (objet → API) | Tiers qui demande un certificat au nom de l'objet : **empreinte comparée par l'exploitant** | Réponse modifiée : l'objet vérifie nom et clé du certificat reçu | Décision horodatée, auteur enregistré | Données publiques seulement (CSR, certificat) | Demandes en masse : **limite de débit**, expiration à 30 min, une seule demande en attente par objet | Nom commun **imposé par le serveur** |
| API ↔ broker (1883, local) | Écoute locale seulement, identifiant et mot de passe | | | | | Comptes limités par l'ACL |
| App → API (REST) | Vol de mot de passe : argon2id, **limite de 5 tentatives par minute** ; vol de jeton : JWT de 8 h dans le stockage chiffré | Entrées invalides : **validation Zod** | Consignes avec leur auteur | HTTPS sur le VPS (#54) ; HTTP en développement local | Limite de débit sur la connexion et l'enrôlement | Rôle **vérifié par l'API**, pas seulement masqué dans l'app |
| Base | Pas exposée hors de la machine (port de développement seulement) | Requêtes paramétrées (Drizzle) | | Mots de passe hachés, aucun secret en base | Rétention de 30 jours des mesures | |

## 2. Mesures en place et preuves

| Mesure | Preuve |
|---|---|
| Broker sans accès anonyme, un compte et des droits par client sur l'écoute locale 1883 | `infra/mosquitto/config/mosquitto.conf` (`listener_allow_anonymous false`) et `acl` ; publication anonyme sur 1883 refusée (vérifiée sur le broker) ; le compte `simulator` n'a aucun droit sur les topics de l'objet (#84) |
| **TLS mutuel sur l'écoute exposée 8883** : refus sans certificat, avec un certificat expiré, d'une autre autorité ou révoqué ; droits limités par l'ACL, même sur une connexion ouverte | `pnpm mqtt:check-devices` : 7 vérifications sur 7 passent (sortie reproduite en section 2.1) |
| **Enrôlement** : aucun certificat avant l'acceptation, nom commun imposé, aucune clé privée échangée, lecteur refusé (403), demande expirée à 30 min, une seule demande en attente | `apps/api/src/modules/enrollment/enrollment.test.ts` (17 tests, dont « aucune requête ni réponse ne contient de clé privée ») ; vérification de bout en bout avec le simulateur et la base réelle (#84) : demande, acceptation, connexion, révocation, refus |
| Clé de l'objet générée sur l'objet, jamais transmise ; certificat reçu vérifié par l'objet | Firmware `src/device_identity.cpp` (mbedTLS) : essai sur le poste, CSR du firmware accepté par l'API avec la même empreinte, certificat à un autre nom refusé (#83) ; simulateur : `tests/enrollment.test.ts` |
| Clé de l'autorité des objets hors du broker et hors du dépôt | `infra/mosquitto/device-ca/` ignoré par Git, jamais monté dans le conteneur du broker (`docker-compose.yml`) ; lue par l'API au moment de signer, jamais journalisée (test « ni les logs la clé de l'autorité ») |
| Connexion à l'app par JWT de 8 h, refus d'un jeton absent, invalide, expiré ou d'un compte supprimé | `apps/api/src/modules/auth/auth.test.ts` |
| Mots de passe hachés en **argon2id**, même erreur pour un e-mail inconnu et un mauvais mot de passe | `apps/api/src/db/seed.ts`, `modules/auth/service.ts` ; tests du service d'authentification |
| Limite de 5 tentatives de connexion par minute et par adresse IP, et du débit des routes publiques de l'enrôlement | Tests « 429 TOO_MANY_ATTEMPTS » (connexion) et « limite les demandes à 10 par minute » (enrôlement) |
| **Rôle exploitant vérifié par l'API** pour les consignes, les panneaux et les objets | Tests 403 de `setpoints.test.ts`, `panels.test.ts`, `enrollment.test.ts` |
| **Double validation des consignes** : API (droits, bornes, objet en ligne), puis objet (limites de la batterie) | `setpoints.test.ts` (403, 409, 422) ; algorithme de l'objet comparé au simulateur, chaque ligne du tableau « statut renvoyé » (`tools/simulator/tests/firmware-control.test.ts`, exécuté en CI) |
| Historique des consignes avec leur auteur | `GET /v1/sites/{id}/setpoints` renvoie `author` ; test de l'historique |
| Validation de toute entrée : requêtes par les schémas Zod, message MQTT invalide ignoré et journalisé | Les 63 schémas ont un exemple accepté et un refusé (`packages/contracts/tests/all-schemas.test.ts`) ; `apps/api/src/mqtt/mqtt.test.ts` |
| **Aucun secret dans le dépôt ni dans l'historique** | `gitleaks` 8.28 sur tout l'historique Git (66 commits, toutes les branches) : « no leaks found » ; fichiers `.env`, `secrets.h`, `device-ca/`, `generated/` ignorés par Git |
| Aucun secret dans le firmware ni dans le projet Wokwi | `secrets.h` ne contient plus ni mot de passe ni clé privée : hôte, port, adresse de l'API et certificat public (#80, #83) |
| Aucune donnée personnelle dans les notifications ni dans les journaux | Tests « le message ne contient aucune donnée personnelle » et « le journal ne contient aucune donnée personnelle » (`notifications/push.test.ts`) |
| JWT dans le stockage chiffré du téléphone, jamais dans SQLite | `apps/mobile/src/auth/session.ts` (`expo-secure-store`) ; test « n'écrit jamais le jeton dans SQLite, seulement dans expo-secure-store » (`apps/mobile/tests/api-source.test.tsx`) |

### 2.1 Refus vérifiés côté objet (D027)

```
OK     Connexion sans certificat client refusée
OK     Connexion avec un certificat expiré refusée
OK     Connexion avec un certificat d'une autre autorité refusée
OK     Certificat valide device-site01 : connexion et publication sur son topic
OK     Certificat valide : aucune publication hors de ses droits (setpoint, autre site)
OK     Connexion déjà ouverte : publication acceptée avant le retrait de l'ACL, refusée après
OK     Certificat révoqué : reconnexion refusée
```

**Demande d'enrôlement non acceptée** : tant que l'exploitant n'a pas accepté, l'API ne renvoie aucun certificat (test « renvoie l'état sans certificat tant que la demande n'est pas acceptée ») et l'objet, sans certificat, est refusé par le broker (première ligne ci-dessus). Vérifié aussi de bout en bout avec le simulateur (#84) : demande en attente, objet hors ligne et sans mesure jusqu'à l'acceptation.

## 3. Au repos

| Donnée | Où | Protection | Pourquoi |
|---|---|---|---|
| JWT et profil de l'utilisateur | Téléphone, `expo-secure-store` | Chiffrés par le Keystore Android | Le jeton donne accès à l'API pendant 8 h |
| Copie locale des réponses de l'API, alertes lues | Téléphone, SQLite (`solar.db`) | **Non chiffrée** ; effacée à la déconnexion ; **exclue des sauvegardes Android** (`allowBackup: false`) | Elle ne contient que des mesures, des alertes et des panneaux du parc, sans donnée personnelle : chiffrer coûterait une dépendance native pour un gain faible |
| Clé privée de l'objet | ESP32, mémoire vive | Jamais écrite en flash ; nouvelle clé à chaque démarrage | Wokwi est public ; pas d'élément sécurisé (limite assumée par D027) |
| Clé de l'autorité des objets | Serveur, `infra/mosquitto/device-ca/` | Hors du dépôt, jamais monté dans le broker ; sur le VPS (#54), lisible par l'API seule | Secret le plus sensible du projet |
| Mots de passe | Base, `users.password_hash` | argon2id | |
| Secrets du serveur (base, JWT, broker, Expo) | Variables d'environnement (`.env`, ignorés par Git) | Jamais versionnés (gitleaks) ; secrets EAS pour Firebase | |

## 4. Mise à jour du firmware

**Fait** : pas d'OTA. Dans Wokwi, le firmware est mis à jour par recompilation (`pio run`) et redémarrage de la simulation ; aucune voie de mise à jour à distance n'existe, donc aucune ne peut être détournée.

**Sur un ESP32 réel**, la voie retenue serait celle d'ESP-IDF : **démarrage sécurisé** (Secure Boot v2, seule une image signée par la clé du projet démarre), **chiffrement de la flash** (la clé privée de l'objet pourrait alors y être conservée), et **OTA signée** avec deux partitions et **retour arrière** automatique si la nouvelle image ne confirme pas son bon fonctionnement. La version du firmware est déjà publiée avec le statut `online` (`firmwareVersion`), ce qui permettrait de suivre le parc.

**Pourquoi** : Wokwi ne simule ni l'eFuse du démarrage sécurisé ni l'OTA. Écrire une mise à jour à distance qu'on ne peut pas tester ouvrirait une surface d'attaque sans bénéfice pour la démonstration.

## 5. Tests d'intrusion

### 5.1 Analyse statique de l'APK (MobSF)

MobSF (image Docker `opensecurity/mobile-security-framework-mobsf`, lancée sur le poste, l'APK n'a été envoyé à aucun service extérieur), APK `preview` du 27 novembre 2026 (EAS, commit `d9f5bb9`, `fr.solar.mobile`, `minSdk` 24, `targetSdk` 36). Score : **46/100**, 2 points élevés, 16 avertissements, aucun traqueur.

| Point | Gravité | Analyse | Suite donnée |
|---|---|---|---|
| Installable sur Android 7.0 (`minSdk` 24), version sans correctifs | Élevée | Valeur par défaut d'Expo SDK 58. L'APK est distribué en interne au seul téléphone de test, récent | **Accepté** pour la démonstration. Pour une diffusion réelle : relever `minSdk` (plugin `expo-build-properties`) |
| Chiffrement AES en mode CBC avec bourrage PKCS7 (oracle de bourrage) | Élevée | Code de `androidx.biometric`, tiré par `expo-secure-store` : il crée une clé de test pour savoir si la biométrie est disponible, sans rien chiffrer ni déchiffrer de données reçues. Aucun oracle n'est exposé. `expo-secure-store` chiffre le jeton en AES-GCM | **Faux positif dans une bibliothèque**, aucune correction dans le projet |
| Données de l'app sauvegardées (`allowBackup=true`) | Avertissement | La copie SQLite des mesures partirait dans la sauvegarde Google | **Corrigé** : `android.allowBackup: false` dans `app.config.ts` |
| Permissions `SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE` | Avertissement | Ajoutées par des dépendances, inutiles à l'app | **Corrigé** : `android.blockedPermissions` (le manifeste généré les retire, vérifié par `expo config --type introspect`) ; à confirmer par une nouvelle analyse au prochain build |
| « Secrets codés en dur » (1 179 occurrences) | Avertissement | Noms de symboles natifs de React Native et Reanimated pris pour des clés ; la configuration Firebase (`google-services.json`) est publique par nature et restreinte à l'app | **Faux positifs**, aucun secret du projet |
| URL HTTP en clair dans le JavaScript | Avertissement | Adresse par défaut de l'API en développement (`http://localhost:3000/v1`) | Sur le VPS, `EXPO_PUBLIC_API_URL` en HTTPS (#54) |
| Requêtes SQL brutes (SQLite) | Avertissement | Requêtes paramétrées de `src/storage/` ; aucune entrée de l'utilisateur concaténée | Aucune |
| WebView, `eval`, générateur aléatoire faible, MD5 et SHA-1, fichiers temporaires | Avertissement | Code des bibliothèques (moteur JavaScript, Expo) ; l'app n'utilise ni WebView ni ces fonctions pour la sécurité | Aucune |
| Récepteurs exportés (Firebase, profileinstaller) | Avertissement | Protégés par des permissions système | Aucune |

Permissions sensibles restantes, toutes utilisées : localisation (placer un panneau, demandée à l'usage) et notifications.

### 5.2 Frida : écarté

Frida sert à l'analyse **dynamique** : contourner l'épinglage de certificat, observer ou modifier l'app pendant qu'elle tourne. Il demande un téléphone rooté ou une app reconstruite avec un agent. L'app ne contient aucun secret à extraire ni aucune logique de sécurité côté client : les droits et la validation sont dans l'API, qui les vérifie de nouveau. Une analyse dynamique apprendrait donc peu, pour un coût élevé (environnement rooté, temps). Les contrôles côté serveur sont, eux, couverts par les tests de l'API.

## 6. RGPD

| Donnée personnelle | Où | Finalité | Conservation |
|---|---|---|---|
| Adresse e-mail, nom | `users` | Connexion ; nom affiché dans l'historique des consignes et les décisions d'enrôlement | Tant que le compte existe |
| Haché du mot de passe | `users` | Connexion | Tant que le compte existe |
| Jeton push Expo | `push_tokens` | Envoyer les alertes au téléphone | Supprimé à la déconnexion, ou dès qu'Expo le refuse |
| Auteur d'une consigne, d'une décision d'enrôlement | `setpoints.author_id`, `device_enrollments.decided_by` | Traçabilité du pilotage (intérêt légitime : sûreté de l'installation) | Avec la consigne ou la demande |

- **Minimisation** : rien d'autre n'est collecté (ni téléphone, ni adresse, ni localisation de l'utilisateur ; la position du téléphone sert seulement à placer un panneau et n'est pas conservée en tant que telle). Les mesures du parc ne sont pas des données personnelles.
- **Aucune donnée personnelle dans les notifications ni dans les journaux** (tests en section 2).
- **Mesures** conservées 30 jours (politique de rétention TimescaleDB).
- **Suppression d'un compte** : par **anonymisation** ([D036](journal/decisions/D036-suppression-compte-par-anonymisation.md)) : l'historique des consignes doit garder son auteur, et la base l'impose (`ON DELETE RESTRICT`). Procédure, par l'administrateur du serveur, dans une transaction :

  ```sql
  BEGIN;
  DELETE FROM push_tokens WHERE user_id = :id;
  UPDATE users
     SET email = 'supprime-' || id || '@invalid', name = 'Compte supprimé',
         password_hash = 'compte-supprime', role = 'viewer'
   WHERE id = :id;
  COMMIT;
  ```

  Le compte ne peut plus se connecter (aucun mot de passe ne correspond à ce haché), son nom disparaît de l'app, et ses jetons d'accès en cours sont refusés à leur expiration (8 h au plus). Un compte qui n'a jamais rien décidé peut être supprimé directement (`DELETE FROM users`).

## 7. ETSI EN 303 645

| Disposition | Réponse du projet |
|---|---|
| 5.1 Pas de mot de passe par défaut universel | L'objet n'a aucun mot de passe : il s'authentifie par un certificat qui lui est propre. Les comptes de l'app ont des mots de passe choisis au déploiement (variables du seed) ; `pnpm mqtt:setup` refuse le mot de passe d'exemple `change-me` pour les comptes du broker |
| 5.2 Gérer les signalements de vulnérabilités | Hors périmètre d'un projet de cours ; les dépendances sont suivies par Dependabot |
| 5.3 Maintenir le logiciel à jour | Dependabot sur le dépôt ; firmware : pas d'OTA dans Wokwi, voie OTA signée prévue pour un ESP32 réel (section 4) |
| 5.4 Stocker les paramètres de sécurité de façon sûre | Clé de l'objet en mémoire vive, clé de l'autorité hors du broker et du dépôt, JWT dans le stockage chiffré, mots de passe en argon2id |
| 5.5 Communiquer de façon sûre | TLS mutuel objet ↔ broker ; HTTPS app ↔ API sur le VPS ; enrôlement en HTTP pendant le développement seulement (données publiques, certificat vérifié par l'objet) |
| 5.6 Réduire la surface d'attaque | Une seule écoute exposée (8883, certificat exigé) ; 1883 et la base sur la machine seulement ; ACL qui refuse tout par défaut ; permissions Android inutiles retirées |
| 5.7 Garantir l'intégrité du logiciel | Démarrage sécurisé non disponible dans Wokwi ; prévu pour un ESP32 réel (section 4) |
| 5.8 Protéger les données personnelles | Section 6 ; aucune donnée personnelle sur l'objet |
| 5.9 Résister aux pannes | Reconnexions automatiques (WiFi, MQTT), consigne retained réappliquée, app utilisable hors ligne avec la copie locale, batterie protégée par l'objet même sans réseau |
| 5.10 Examiner la télémétrie | Alertes (objet hors ligne, consigne sans réponse, production basse) ; indicateurs de performance (`pnpm perf:report`) |
| 5.11 Faciliter la suppression des données | Déconnexion de l'app : copie locale et jeton push effacés ; compte anonymisé (section 6) ; objet révoqué depuis l'app |
| 5.12 Faciliter l'installation et la maintenance | Enrôlement guidé : empreinte sur le moniteur série, comparaison et acceptation dans l'app, révocation en un geste |
| 5.13 Valider les entrées | Schémas Zod pour toute requête et tout message MQTT ; analyseur de consigne du firmware comparé aux schémas ; message invalide ignoré et journalisé |

## 8. Limites connues

- Pas de limite de débit sur le broker : un objet accepté peut publier vite sur ses propres topics.
- Enrôlement en HTTP pendant le développement (tunnel bore) : un intermédiaire peut bloquer l'enrôlement, pas obtenir un certificat utilisable.
- Clé de l'objet en mémoire vive, sans élément sécurisé : un firmware modifié pourrait la divulguer.
- Un jeton d'accès reste valable jusqu'à son expiration (8 h) après un changement de rôle ou une anonymisation : pas de liste de révocation des JWT.
- La copie locale SQLite n'est pas chiffrée (choix expliqué en section 3).
