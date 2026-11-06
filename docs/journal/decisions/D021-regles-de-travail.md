# D021 · Règles de travail communes : CLAUDE.md, skills et flux Git

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Proposée |
| **Décideurs** | À compléter |
| **Liens** | Issue #3 · `CLAUDE.md` · `.claude/` |

## Contexte

Le binôme développe en parallèle, chacun avec son assistant. Sans règles écrites, le code risque de diverger : langue des noms, découpe des modules, couleurs en dur, formats MQTT recopiés, commits hétérogènes. Les règles doivent être lues automatiquement par les assistants et applicables par les personnes.

## Options étudiées

**Où écrire les règles**

| Critère | README seul | Wiki GitHub | `CLAUDE.md` + skills dans `.claude/` |
|---|---|---|---|
| Lu automatiquement par les assistants | Non | Non | Oui |
| Versionné avec le code, relu en pull request | Oui | Non | Oui |
| Procédures pas à pas pour les tâches répétitives | Peu lisible | Possible | Oui (un skill par tâche) |

**Flux Git**

| Critère | Tout sur `main` | Branches d'issue vers `main` | `develop` d'intégration + `main` livrable |
|---|---|---|---|
| Relecture avant fusion | Non | Oui | Oui |
| Version stable toujours disponible | Non | Variable | Oui : `main` ne bouge qu'à chaque livraison |
| Documentation poussée sans pull request | Oui | Non | Oui, sur `develop` |
| Historique | Bruité | Un commit par issue | Un commit par issue sur `develop`, une fusion par livraison sur `main` |

## Décision

- Règles dans **`CLAUDE.md`** (court, directif, renvoie aux documents de conception) et **six skills** dans `.claude/skills/` : `issue-workflow`, `api-module`, `mobile-screen`, `mqtt-message`, `db-change`, `decision-record`.
- **`.claude/settings.json`** partagé : commandes de vérification autorisées sans confirmation ; lecture des `.env` et `secrets.h`, push forcé et `--no-verify` interdits.
- **Flux Git** :
  - `develop` est la branche d'intégration et la branche par défaut du dépôt. Chaque issue a sa branche `<type>/<numéro>-<sujet>`, créée depuis `develop`, et une pull request vers `develop` relue par l'autre membre, fusionnée en **squash merge**. La documentation seule peut être poussée directement sur `develop`.
  - `main` ne reçoit que des pull requests venant de `develop`, fusionnées par **merge commit**. Une vérification de la CI (« Source de la pull request ») bloque toute autre source, GitHub ne sachant pas l'imposer nativement.
  - Commits et titres de pull request en conventional commit sur une ligne, type et scope en anglais, description en français, sans `Co-Authored-By`.

## Justification

Les règles sont appliquées de la même façon par les deux membres et leurs assistants, relues comme du code, et l'historique de `main` reste lisible pour le dossier (un commit par issue).

## Conséquences

- Protections GitHub (issue #17) : sur `main`, pull request, CI verte (dont la vérification de la source) et approbation obligatoires, push forcé et suppression interdits ; sur `develop`, push forcé et suppression interdits, push direct autorisé. `develop` devient la branche par défaut, et Dependabot la cible.
- Toute nouvelle règle passe par une modification de `CLAUDE.md` en pull request.
- Les commandes citées dans `CLAUDE.md` deviennent réelles avec les issues du socle (#5 à #18).
