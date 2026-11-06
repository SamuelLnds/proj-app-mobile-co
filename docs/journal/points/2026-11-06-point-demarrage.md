# Point de démarrage · 6 novembre 2026

> Premier point d'étape du projet. Il retrace le cheminement depuis la découverte du module jusqu'à la conception initiale : les études menées, les pistes explorées puis abandonnées, et les décisions prises.
>
> **Statut : clos le 6 novembre 2026.** Toutes les décisions de la période sont acceptées. Les évolutions ultérieures seront tracées dans de nouvelles fiches et dans les points suivants.

## 1. Cadre de départ

| Élément | Contenu |
|---|---|
| Module | « Applications mobiles et connectées », M2 DFS, 45 h 30 |
| Évaluation | 60 / 20 / 20, binôme ou trinôme, note individuelle, oral où chacun défend ses choix |
| Livrables | Code, device de test, firmware ou simulation, documentation technique, dossier sécurité |
| Attendus | Les cinq gestes (lire une grandeur, l'afficher, alerter au seuil, synchroniser vers un back-end, démo live) et les sept chapitres de la carte du module |
| Exemples de métiers | Station météo, suivi de plantes, domotique LED ou relais, présence par badge BLE (liste non fermée) |
| Technologies évoquées au départ | Wokwi, Mosquitto, Expo, GitHub Actions, base de séries temporelles, API REST ou GraphQL |

## 2. Chronologie des études

| # | Étude | Ce qui en est ressorti |
|---|---|---|
| 1 | Première liste d'idées de projet (11 sujets) et matrice de couverture des cas d'usage techniques | Les sujets « bâtiment intelligent » et « parc solaire » couvrent le plus de cas d'usage |
| 2 | Exploration des contraintes de fonctionnement : temps réel, connectivité intermittente, hors ligne, économie d'énergie, accessibilité | Identification de tensions entre contraintes (veille profonde ↔ temps réel, flux temps réel ↔ lecteur d'écran) |
| 3 | Exploration sécurité et conformité : chiffrement, OTA sécurisée, tests de pénétration, RGPD, ETSI EN 303 645 | EN 303 645 vise l'IoT grand public ; pour une infrastructure énergétique, IEC 62443 et NIS2 sont plus pertinents |
| 4 | Exploration observabilité et livraison : logs, traces OpenTelemetry, tests, build, distribution, OTA | Beaucoup de briques possibles, dont une partie hors du périmètre du module |
| 5 | Méthode de choix du sujet par les signaux : capteurs simulables, flux de données publics, capteurs du téléphone | Critères d'un bon signal : variation lisible, seuil, localisation, action retour, simulable, données réelles disponibles |
| 6 | **Grille comparative de 30 sujets**, notés sur 4 axes et 8 critères | Classement de tête : pilotage carbone, îlots de chaleur (18/20), parc solaire, crues, air des salles, irrigation (17/20) |
| 7 | Étude du sujet « parc solaire » : adéquation au module, capteurs, données, contraintes | Sujet retenu ([D001](../decisions/D001-sujet-parc-solaire.md)) |
| 8 | Étude de la visualisation 3D : options techniques et risques | Viable si bornée, en bonus ([D013](../decisions/D013-vue-3d-bonus.md)) |
| 9 | Remplissage de la carte du module (choix par famille, lettres E/S/B par chapitre) | Relevé rendu en séance |
| 10 | **Étude de Wokwi** : composants disponibles, réseau, CI, extension VS Code, limites | Contrainte majeure : en offre gratuite, la simulation ne joint qu'Internet ([D007](../decisions/D007-objet-wokwi.md), [D008](../decisions/D008-broker-hivemq-cloud.md)) |
| 11 | Étude de faisabilité détaillée, estimation de charge (≈ 200 h) | Charge jugée trop élevée |
| 12 | **Réduction du périmètre** | Socle à ≈ 60 h, bonus séparés ([D002](../decisions/D002-perimetre-reduit.md)) |
| 13 | Retour de l'enseignant : le pilotage est insuffisant | Comparaison tracker ↔ répartition batterie / réseau ([D003](../decisions/D003-pilotage-batterie-reseau.md)) ; socle à ≈ 70 h |
| 14 | Conception initiale : modèle de données, UML, cartographie technique | Ajout du mode restitution ([D004](../decisions/D004-mode-restitution.md)), choix de la stack ([D005](../decisions/D005-framework-mobile.md) à [D011](../decisions/D011-monorepo-contrats.md)) |
| 15 | Relecture par le groupe | Code en anglais ([D012](../decisions/D012-langue-du-code.md)) ; SQLite pour le stockage local ([D014](../decisions/D014-stockage-local-sqlite.md)) |

## 3. Comparaisons clés

### 3.1 Choix du sujet

| Sujet | Conformité | Technique | Faisabilité | Originalité | Total /20 | Remarque |
|---|---|---|---|---|---|---|
| Pilotage carbone du logement | 4 | 5 | 4 | 5 | 18 | Original, mais pas de dimension cartographique |
| Îlots de chaleur urbains | 5 | 4 | 5 | 4 | 18 | Peu d'actionneurs |
| **Parc solaire** | 4 | 5 | 4 | 4 | 17 | **Retenu** : carte, volume, action retour, motivation de l'équipe |
| Surveillance de crues | 4 | 5 | 4 | 4 | 17 | Alertes fortes, pilotage limité |
| Serre connectée | 5 | 4 | 5 | 2 | 16 | Exemple du module, peu différenciant |
| Présence par badge BLE | 5 | 5 | 3 | 3 | 16 | BLE non simulable dans Wokwi |

### 3.2 Pilotage

| Critère | Rotation des panneaux | Répartition batterie / réseau |
|---|---|---|
| Pilotage à distance | Faible | **Fort** |
| Communication bidirectionnelle | Moyenne | **Forte** |
| Charge | ≈ 10 h | ≈ 10 à 12 h |
| Décision | Bonus | **Socle** |

### 3.3 Périmètre

| | Périmètre exploré | Périmètre retenu |
|---|---|---|
| Charge | ≈ 200 h | ≈ 70 h + bonus |
| Briques | App, API, base, broker auto-hébergé, plusieurs boîtiers, OTA, TLS mutuel, OpenTelemetry, tests de pénétration, hors ligne complet, 3D | App, API, base, broker hébergé, un objet simulé, simulateur de panneaux |
| Bonus | — | Vue 3D, rotation des panneaux, flux SSE |

### 3.4 Broker

| Option | Joignable depuis Wokwi gratuit | Coût | Administration | Décision |
|---|---|---|---|---|
| Mosquitto local | Non | Gratuit | Faible | Écarté |
| Mosquitto hébergé | Oui | Serveur à prévoir | Serveur à maintenir | Écarté |
| **HiveMQ Cloud** | Oui | Gratuit | Aucune | **Retenu** |
| Wokwi payant + Mosquitto local | Oui | ≈ 6 à 7 € par mois | Faible | Écarté |

## 4. Pistes explorées puis abandonnées

| Piste | Raison de l'abandon | Devenir |
|---|---|---|
| Bâtiment ou campus intelligent | Moins concret à raconter que le parc solaire | — |
| Présence par badge BLE | BLE non simulé par Wokwi, matériel réel obligatoire | — |
| Plusieurs boîtiers (chaîne, météo, tracker) | Complexité ; une seule carte par projet Wokwi | Un seul ESP32 |
| Flotte de centaines de panneaux | Volume inutile pour la démonstration | 20 panneaux simulés |
| Mosquitto auto-hébergé | Injoignable depuis Wokwi gratuit sans serveur public | HiveMQ Cloud |
| GraphQL avec abonnements | Surdimensionné pour le besoin | REST + interrogation périodique |
| PostGIS | Positions simples suffisantes (latitude, longitude) | Colonnes numériques |
| TLS mutuel, OTA signée, chiffrement au repos, tests de pénétration | Hors périmètre du temps disponible | Pistes d'évolution pour le dossier |
| OpenTelemetry, logs chiffrés, trace de bout en bout | Idem | Pistes d'évolution |
| Mode hors ligne complet (file d'envoi, synchronisation) | Idem | Affichage des dernières données sans réseau |
| Vocabulaire métier en français dans le code | Non conforme aux usages ; mélange de langues | Code en anglais |

## 5. Décisions de la période

| N° | Décision | Statut |
|---|---|---|
| [D001](../decisions/D001-sujet-parc-solaire.md) | Sujet : supervision et pilotage d'un parc solaire | Acceptée |
| [D002](../decisions/D002-perimetre-reduit.md) | Périmètre réduit, bonus après le socle | Acceptée |
| [D003](../decisions/D003-pilotage-batterie-reseau.md) | Pilotage batterie / réseau | Acceptée |
| [D004](../decisions/D004-mode-restitution.md) | Mode restitution | Acceptée |
| [D005](../decisions/D005-framework-mobile.md) | Expo / React Native | Acceptée |
| [D006](../decisions/D006-protocole-mqtt.md) | MQTT 3.1.1 | Acceptée |
| [D007](../decisions/D007-objet-wokwi.md) | Un ESP32 simulé dans Wokwi | Acceptée |
| [D008](../decisions/D008-broker-hivemq-cloud.md) | HiveMQ Cloud | Acceptée |
| [D009](../decisions/D009-base-timescaledb.md) | PostgreSQL + TimescaleDB | Acceptée |
| [D010](../decisions/D010-api-rest-fastify.md) | REST avec Fastify | Acceptée |
| [D011](../decisions/D011-monorepo-contrats.md) | Monorepo pnpm, contrats Zod partagés | Acceptée |
| [D012](../decisions/D012-langue-du-code.md) | Code en anglais, commentaires et documentation en français | Acceptée |
| [D013](../decisions/D013-vue-3d-bonus.md) | Vue 3D en bonus | Acceptée |
| [D014](../decisions/D014-stockage-local-sqlite.md) | SQLite pour le stockage local, TanStack Query pour le réseau | Acceptée |

## 6. Carte du module renseignée

| Famille | Choix |
|---|---|
| Framework | React Native |
| Protocole | MQTT |
| Objet | Wokwi |
| Broker | HiveMQ |
| Rétention | Timescale |
| Banc | Téléphone |
| Distribution | Device de test |
| Métier | Supervision et pilotage d'un parc solaire (proche météo) |

| Chapitre | Lettre |
|---|---|
| 1 Mobile | E |
| 2 Dialogue avec l'objet | E |
| 3 Passerelles et brokers | S |
| 4 Données capteur | E |
| 5 UI et terrain | E |
| 6 Sécurité | S |
| 7 Observer, tester, déployer | S |

## 7. État à la fin de la période

| Livrable | État |
|---|---|
| [Étude de faisabilité](../../etude-faisabilite-parc-solaire.md) | Rédigée, à jour du pilotage |
| [Modèle de données](../../conception/01-modele-donnees.md) | Rédigé, à relire |
| [UML](../../conception/02-uml.md) | Rédigé, à relire |
| [Cartographie technique](../../conception/03-cartographie-technique.md) | Rédigée, à relire |
| Code | Aucun (le prototype Wokwi initial a été retiré, il sera refait au socle) |

## 8. Questions ouvertes

- Validation du sujet par l'enseignant (variante de « station météo »).
- Taille définitive du groupe.
- Hébergement de démonstration de l'API et de la base.
- Droits par client disponibles dans l'offre gratuite de HiveMQ Cloud.

## 9. Prochaines étapes

1. Besoins fonctionnels : issues et milestones GitHub.
2. Maquettage : typographie, icônes, couleurs accessibles, écrans.
3. Règles de travail : `CLAUDE.md` et dossier `.claude/`.
4. Mise en place du socle : dépendances, découpage du dépôt, Dependabot, CI/CD.
5. Répartition du développement.
