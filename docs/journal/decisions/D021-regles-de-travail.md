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

| Critère | Commits directs sur `main` | Branche par issue, merge commit | Branche par issue, squash merge |
|---|---|---|---|
| Relecture avant fusion | Non | Oui | Oui |
| Historique de `main` | Bruité | Commits intermédiaires visibles | Un commit par issue, au format conventional commit |
| Lien avec les issues | Manuel | `Closes #n` | `Closes #n` |

## Décision

- Règles dans **`CLAUDE.md`** (court, directif, renvoie aux documents de conception) et **six skills** dans `.claude/skills/` : `issue-workflow`, `api-module`, `mobile-screen`, `mqtt-message`, `db-change`, `decision-record`.
- **`.claude/settings.json`** partagé : commandes de vérification autorisées sans confirmation ; lecture des `.env` et `secrets.h`, push forcé et push direct sur `main` interdits.
- **Flux Git** : une issue = une branche `<type>/<numéro>-<sujet>` = une pull request relue par l'autre membre, fusionnée en **squash merge**. Commits et titres de pull request en conventional commit sur une ligne, type et scope en anglais, description en français, sans `Co-Authored-By`.

## Justification

Les règles sont appliquées de la même façon par les deux membres et leurs assistants, relues comme du code, et l'historique de `main` reste lisible pour le dossier (un commit par issue).

## Conséquences

- La protection de la branche `main` (relecture et CI obligatoires) est activée avec l'issue #17.
- Toute nouvelle règle passe par une modification de `CLAUDE.md` en pull request.
- Les commandes citées dans `CLAUDE.md` deviennent réelles avec les issues du socle (#5 à #18).
