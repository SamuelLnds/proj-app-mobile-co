# CLAUDE.md

Règles du projet pour tous les membres du groupe et leurs assistants. Elles s'appliquent à chaque modification du dépôt.

## Le projet

Application mobile de supervision et de pilotage d'un petit parc solaire (module « Applications mobiles et connectées », M2 DFS). Un ESP32 simulé dans Wokwi publie ses mesures en MQTT (HiveMQ Cloud) ; une API Node enregistre tout dans PostgreSQL + TimescaleDB ; une app Expo affiche les données et envoie des consignes (répartition de la production entre batterie et réseau).

## Sources de vérité

Les documents de conception **font foi sur le code**. Avant toute tâche, lire ceux qui la concernent :

| Sujet | Document |
|---|---|
| Périmètre et contexte | `docs/etude-faisabilite-parc-solaire.md` |
| Tables, colonnes, enums, SQL | `docs/conception/01-modele-donnees.md` |
| Comportements, séquences, règles d'alerte, algorithme de pilotage | `docs/conception/02-uml.md` |
| Arborescence, dépendances, topics MQTT, routes REST, constantes, variables d'environnement | `docs/conception/03-cartographie-technique.md` |
| Issues, critères d'acceptation, définition de « terminé » | `docs/conception/04-besoins-fonctionnels.md` |
| Couleurs, typographie, icônes, maquettes | `docs/conception/05-charte-graphique.md` |
| Pourquoi chaque choix a été fait | `docs/journal/` |

Si le code doit s'écarter d'un document : **modifier d'abord le document**, dans la même pull request, et créer une fiche de décision si le choix est structurant (skill `decision-record`). Ne jamais laisser code et documents se contredire.

## Langue

- **Code en anglais** : tables, colonnes, enums et leurs valeurs, champs JSON, topics, routes, codes d'erreur, fichiers, dossiers, variables, fonctions, types, variables d'environnement. Glossaire français ↔ anglais : section 1 de `01-modele-donnees.md`.
- **Français** : commentaires dans le code, documentation, textes affichés à l'utilisateur (interface, `message` des erreurs de l'API, alertes, notifications).
- Casse : `snake_case` en base, `camelCase` en TypeScript et JSON, `PascalCase` pour les types et composants, `kebab-case` pour les routes et les noms de fichiers non composants, `UPPER_SNAKE_CASE` pour les constantes et variables d'environnement.

## Organisation du dépôt

```
apps/mobile          App Expo (React Native, Expo Router)
apps/api             API Fastify
packages/contracts   Schémas Zod partagés, enums, constantes, topics (aucune logique métier)
tools/simulator      Simulateur des 20 panneaux (jamais déployé)
firmware/site-device Firmware ESP32 (PlatformIO, Wokwi)
infra/               Docker Compose, données de seed
docs/                Conception et journal
```

- Les applications et outils n'importent jamais un autre dossier de `apps/` ou `tools/` : seul `@solar/contracts` est partagé.
- Tout format échangé (message MQTT, requête, réponse) est défini **une seule fois** dans `packages/contracts`, puis importé.
- Les valeurs partagées (seuils, délais, paramètres du site de démo) sont dans `packages/contracts/src/constants.ts`, recopiées à l'identique dans `firmware/site-device/include/config.h`.

## Commandes

Depuis la racine (pnpm workspaces) :

| Commande | Effet |
|---|---|
| `pnpm install` | Installe toutes les dépendances |
| `pnpm dev` | Lance la base (Docker), l'API et le simulateur |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | Vérifications, aussi exécutées par la CI |
| `pnpm format` | Formate le code avec Prettier |
| `pnpm --filter <api\|mobile\|simulator\|contracts> <script>` | Script d'un seul paquet |
| `pnpm --filter api db:migrate` · `db:seed` | Migrations et données de démonstration |

Ces commandes sont mises en place par les issues du socle (#5 à #18) : vérifier dans `package.json` qu'elles existent avant de les utiliser.

## Règles par zone

**API (`apps/api`)**
- Chaque module (`src/modules/<nom>/`) a trois fichiers : `routes.ts` (HTTP seulement), `service.ts` (règles métier), `repository.ts` (requêtes Drizzle). Une route n'accède jamais à la base.
- Toute entrée (requête HTTP, message MQTT) est validée par son schéma de `@solar/contracts` ; un message MQTT invalide est ignoré et journalisé, jamais une cause d'arrêt.
- Erreurs au format `{ error: { code, message, details } }` avec les codes de la section 7.1 de la cartographie.
- Routes réservées à l'exploitant : vérifier le rôle `operator` côté API, même si l'app masque le bouton.

**Mobile (`apps/mobile`)**
- Respecter les maquettes et la charte. **Aucune couleur écrite en dur** : uniquement les jetons de `src/theme/` (thèmes clair et sombre).
- Appels réseau par TanStack Query (`src/api/`), stockage local par SQLite (`src/storage/`), JWT uniquement dans `expo-secure-store`.
- Accessibilité : `accessibilityLabel` sur tout élément interactif sans texte, zones tactiles d'au moins 48 px, aucun état signalé par la couleur seule.

**Base de données** : toute modification passe d'abord par `01-modele-donnees.md`, puis le schéma Drizzle et une migration (skill `db-change`).

**MQTT** : tout ajout ou changement de message suit le skill `mqtt-message` (contrats, documentation, API, firmware, simulateur).

## Sécurité

- Aucun secret dans le dépôt : `.env` et `secrets.h` sont ignorés par Git ; seuls `.env.example` et `secrets.example.h` sont versionnés, sans valeur réelle.
- Ne jamais lire, afficher ni recopier le contenu d'un fichier `.env` ou `secrets.h`.
- Mots de passe hachés en argon2id ; jamais de donnée personnelle dans une notification push ni dans les logs.

## Git et GitHub

- **Branches permanentes** ([D021](docs/journal/decisions/D021-regles-de-travail.md)) :
  - `develop` : branche d'intégration et branche par défaut. Elle reçoit les branches d'issue par pull request ; la documentation seule (`docs/`, `CLAUDE.md`, `.claude/`) peut y être poussée directement.
  - `main` : version livrable. Elle ne reçoit **que** des pull requests venant de `develop` (vérifié par la CI), fusionnées par **merge commit**.
- Une issue = une branche = une pull request vers `develop`. Branche créée depuis `develop` : `<type>/<numéro>-<sujet-court>` (par exemple `feat/41-envoi-consigne`).
- **Commits** : conventional commit sur **une seule ligne**, type et scope en anglais, description en français (`feat(api): ajoute l'envoi d'une consigne`). Une seconde ligne est permise uniquement pour référencer une issue (`Refs #41`). **Jamais de ligne `Co-Authored-By`** ni d'autre mention d'outil.
- Types : `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `style`. Scopes : `api`, `mobile`, `contracts`, `simulator`, `firmware`, `infra`, `ci`, `design`, `journal`.
- Pull request d'issue : titre au même format que les commits, description reprenant la définition de « terminé » et `Closes #<numéro>`, cible `develop`, fusion en **squash merge** (le titre devient le commit sur `develop`).
- Jamais de push direct sur `main`, jamais de push forcé sur `main` ni `develop`. Pas de push sans demande explicite de la personne qui travaille.
- Une issue se modifie d'abord dans `04-besoins-fonctionnels.md`, puis sur GitHub.

## Définition de « terminé »

Une issue est terminée quand tous ses critères d'acceptation sont cochés, que le code respecte la conception, que lint, types et tests passent, que les tests demandés existent, et que la pull request est relue par un autre membre puis fusionnée. Détail : section 1.3 de `04-besoins-fonctionnels.md`.

## Journal du dossier

Tout choix qui engage le projet (technologie, périmètre, architecture, organisation) donne lieu à une fiche dans `docs/journal/decisions/` (skill `decision-record`) et à une ligne dans l'index `docs/journal/README.md`. Une fiche n'est jamais supprimée : elle est remplacée par une nouvelle.

## À ne pas faire

- Donner des estimations de durée.
- Ajouter une dépendance, une table, une route ou un topic absent de la conception sans mettre la conception à jour.
- Écrire une valeur partagée en dur au lieu d'utiliser `@solar/contracts`.
- Contourner un échec de lint, de types, de test ou d'un hook (pas de `--no-verify`, pas de désactivation de règle sans justification écrite).

## Skills du projet

| Skill | Quand l'utiliser |
|---|---|
| `issue-workflow` | Prendre une issue, de la branche à la pull request |
| `api-module` | Créer ou modifier un module de l'API |
| `mobile-screen` | Créer ou modifier un écran de l'app |
| `mqtt-message` | Ajouter ou modifier un message MQTT |
| `db-change` | Modifier le modèle de données |
| `decision-record` | Rédiger une fiche de décision du journal |
