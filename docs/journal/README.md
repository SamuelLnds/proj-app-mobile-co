# Journal de projet

Ce dossier trace **les études menées, les comparaisons, les choix et leur justification**, tout au long du projet. Il alimente le dossier à rendre.

## Organisation

| Dossier | Contenu | Quand écrire |
|---|---|---|
| [`points/`](points/) | **Points d'étape** : synthèse datée de l'état du projet, des études menées et des décisions de la période | Au démarrage, à chaque jalon important, et à la fin du projet |
| [`decisions/`](decisions/) | **Fiches de décision** (une par décision) : contexte, options comparées, choix, conséquences | Dès qu'un choix engage le projet (technologie, périmètre, architecture, organisation) |

## Règles

1. **Une décision = une fiche**, numérotée dans l'ordre (`D001`, `D002`…), rédigée à partir du [modèle](decisions/_modele.md).
2. Une fiche n'est **jamais supprimée**. Si une décision est remise en cause, on crée une nouvelle fiche et on passe l'ancienne au statut « Remplacée par Dxxx ».
3. Chaque fiche compare **au moins deux options**, avec des critères explicites.
4. Les fiches sont relues en pull request comme du code.
5. Toute modification des documents de [conception](../conception/) qui découle d'une décision cite la fiche correspondante.

**Statuts possibles :** Proposée · Acceptée · Remplacée par Dxxx · Abandonnée.

## Points d'étape

| Date | Point | Résumé |
|---|---|---|
| 2026-11-06 | [Point de démarrage](points/2026-11-06-point-demarrage.md) (clos) | Choix du sujet, cadrage du périmètre, choix techniques, conception initiale |
| — | Point final | À rédiger en fin de projet |

## Index des décisions

| N° | Décision | Date | Statut |
|---|---|---|---|
| [D001](decisions/D001-sujet-parc-solaire.md) | Sujet : supervision et pilotage d'un parc solaire | 2026-11-06 | Acceptée |
| [D002](decisions/D002-perimetre-reduit.md) | Périmètre volontairement réduit, bonus après le socle | 2026-11-06 | Acceptée |
| [D003](decisions/D003-pilotage-batterie-reseau.md) | Pilotage par répartition batterie / réseau plutôt que par tracker | 2026-11-06 | Acceptée |
| [D004](decisions/D004-mode-restitution.md) | Ajout du mode « restitution » | 2026-11-06 | Acceptée |
| [D005](decisions/D005-framework-mobile.md) | Framework mobile : Expo / React Native | 2026-11-06 | Acceptée |
| [D006](decisions/D006-protocole-mqtt.md) | Protocole objet : MQTT 3.1.1 | 2026-11-06 | Acceptée |
| [D007](decisions/D007-objet-wokwi.md) | Objet : un seul ESP32 simulé dans Wokwi | 2026-11-06 | Acceptée |
| [D008](decisions/D008-broker-hivemq-cloud.md) | Broker : HiveMQ Cloud | 2026-11-06 | Acceptée |
| [D009](decisions/D009-base-timescaledb.md) | Base : PostgreSQL + TimescaleDB | 2026-11-06 | Acceptée |
| [D010](decisions/D010-api-rest-fastify.md) | API : REST avec Fastify, sans GraphQL | 2026-11-06 | Acceptée |
| [D011](decisions/D011-monorepo-contrats.md) | Monorepo pnpm et contrats Zod partagés | 2026-11-06 | Acceptée |
| [D012](decisions/D012-langue-du-code.md) | Code en anglais ; commentaires, documentation et textes affichés en français | 2026-11-06 | Acceptée |
| [D013](decisions/D013-vue-3d-bonus.md) | Vue 3D en bonus, avec React Three Fiber | 2026-11-06 | Acceptée |
| [D014](decisions/D014-stockage-local-sqlite.md) | Stockage local de l'app : SQLite, avec TanStack Query pour le réseau | 2026-11-06 | Acceptée |
| [D015](decisions/D015-emplacement-simulateur.md) | Le simulateur de panneaux est placé dans `tools/` | 2026-11-06 | Acceptée |

