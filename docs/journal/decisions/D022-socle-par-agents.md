# D022 · Socle réalisé par des agents, sur une seule branche

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | Issues #5 à #18 · [D021](D021-regles-de-travail.md) |

## Contexte

Le socle technique (issues #5 à #18) est une suite de tâches de mise en place qui dépendent les unes des autres (monorepo, contrats, base, API, app, simulateur, CI) et partagent les mêmes fichiers (`package.json`, `pnpm-lock.yaml`). La règle « une issue = une branche = une pull request » ([D021](D021-regles-de-travail.md)) imposerait douze relectures et fusions dans un ordre strict avant de pouvoir développer.

## Options étudiées

**Livraison Git**

| Critère | Une branche par issue, empilées | Une branche `chore/socle`, un commit par issue |
|---|---|---|
| Respect de D021 | Strict | Exception limitée au socle |
| Relectures | Douze pull requests à fusionner dans l'ordre | Une pull request, commits lisibles un par un |
| Compatibilité avec le squash merge | Mauvaise (l'empilement casse après chaque squash) | Bonne |
| Traçabilité par issue | Une pull request par issue | Un commit par issue (`Refs #n`), la pull request ferme toutes les issues |

**Réalisation**

| Critère | À la main par le binôme | Agents d'un modèle plus léger, orchestrés et vérifiés |
|---|---|---|
| Temps du binôme | Élevé, sur des tâches de configuration | Faible : relecture seulement |
| Homogénéité | Dépend de chacun | Mêmes règles pour toutes les étapes (`CLAUDE.md`, spécification) |
| Risque d'erreur | Moyen | Compensé par une étape finale de vérification complète |

## Décision

- Le socle est réalisé par un **workflow d'agents** : Sonnet pour le code (monorepo, contrats, API, app, CI), Haiku pour les tâches simples (base Docker, simulateur), exécutés l'un après l'autre, puis un agent de vérification (installation propre, lint, formatage, types, tests, migrations, seed, appel de l'API, conformité aux documents, absence de secrets).
- Livraison sur **une seule branche `chore/socle`**, avec **un commit par issue**, et une seule pull request vers `develop` qui ferme les issues terminées.

## Justification

Le socle est cohérent comme un tout et sa relecture est plus simple d'un seul tenant. Les agents suivent la spécification et les règles du dépôt ; la vérification finale garantit que l'ensemble fonctionne réellement.

## Conséquences

- Exception à D021 limitée au socle : toutes les issues suivantes reprennent une branche et une pull request par issue.
- Restent à faire par le binôme : création du broker HiveMQ Cloud (#11), development build installé sur le téléphone (#15), protections de branches sur GitHub (#17).
- Écarts relevés par les agents (versions, noms choisis là où la spécification ne disait rien) : listés dans la description de la pull request du socle.
