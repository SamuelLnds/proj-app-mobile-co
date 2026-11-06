---
name: issue-workflow
description: Prendre une issue GitHub du projet et la mener jusqu'à la pull request (lecture de la spécification, branche, implémentation, vérifications, commit, pull request). À utiliser dès qu'on commence le travail sur une issue numérotée.
---

# Mener une issue jusqu'à la pull request

## 1. Comprendre

1. Lire l'issue : `gh issue view <numéro>`.
2. Lire sa version de référence dans `docs/conception/04-besoins-fonctionnels.md` (section `### #<numéro>`). En cas de différence avec GitHub, le document fait foi : le signaler.
3. Vérifier que les issues de « Dépend de » sont fermées (`gh issue view`). Sinon, s'arrêter et le dire.
4. Lire chaque document cité dans « Références », ainsi que les règles de `CLAUDE.md` pour la zone concernée.
5. Lister les critères d'acceptation : ils sont le contrat de la tâche.

## 2. Préparer

1. Partir de `main` à jour : `git switch main`, puis `git pull`.
2. Créer la branche `<type>/<numéro>-<sujet-court>` : `git switch -c feat/41-envoi-consigne`.
   Types : `feat` (fonctionnalité), `fix`, `chore` (mise en place, configuration), `docs`, `test`, `ci`, `refactor`.

## 3. Réaliser

- Utiliser le skill de la zone : `api-module`, `mobile-screen`, `mqtt-message`, `db-change`.
- Écrire les tests demandés par les critères d'acceptation en même temps que le code.
- Si un écart avec la conception est nécessaire : modifier le document dans la même branche, et rédiger une fiche avec `decision-record` si le choix est structurant.
- Ne rien faire hors du périmètre de l'issue. Un problème découvert ailleurs devient une nouvelle issue, d'abord ajoutée dans `04-besoins-fonctionnels.md`.

## 4. Vérifier

1. `pnpm lint`, `pnpm typecheck`, `pnpm test` : tout doit passer.
2. Reprendre chaque critère d'acceptation et vérifier qu'il est rempli (test, capture ou démonstration).
3. Relire le diff : pas de secret, pas de couleur ou de valeur partagée en dur, pas de code commenté laissé en place.

## 5. Commiter

- Conventional commit sur une ligne, type et scope en anglais, description en français : `feat(api): ajoute l'envoi d'une consigne`.
- Seconde ligne facultative, uniquement `Refs #<numéro>`.
- Aucune ligne `Co-Authored-By` ni mention d'outil.
- Plusieurs petits commits sont permis : la fusion se fait en squash.

## 6. Ouvrir la pull request

Seulement si la personne le demande (pas de push sans accord) :

```
git push -u origin <branche>
gh pr create --title "<même format que les commits>" --body-file <fichier>
```

Corps de la pull request :

```
<Une ou deux phrases sur ce qui change.>

## Critères d'acceptation
- [x] … (copiés de l'issue, tous cochés)

## Vérifications
- [x] lint, types et tests passent
- [x] documents de conception à jour (ou inchangés)

Closes #<numéro>
```

Ensuite, demander une relecture à l'autre membre du binôme. La fusion se fait en squash merge, après approbation et CI verte.
