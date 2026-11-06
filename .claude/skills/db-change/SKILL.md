---
name: db-change
description: Modifier le modèle de données PostgreSQL + TimescaleDB (table, colonne, enum, contrainte, index) en commençant par la documentation, puis le schéma Drizzle et une migration. À utiliser pour toute évolution de la base.
---

# Modifier le modèle de données

## 1. Documentation d'abord

Dans `docs/conception/01-modele-donnees.md` :
- modèle conceptuel (diagramme), énumérations, dictionnaire de données (type, nullabilité, défaut, contraintes, description), index ;
- script SQL de référence (section 7), qui doit rester exécutable ;
- si la modification est structurante, fiche de décision (skill `decision-record`).

Conventions : noms en anglais, `snake_case`, tables au pluriel ; dates en `timestamptz` suffixées `_at` ; unité dans le nom (`_w`, `_wh`, `_pct`, `_c`) ; clés primaires `uuid` par `gen_random_uuid()` (sauf tables de mesures).

## 2. Contrats

Si une énumération change, mettre à jour `packages/contracts/src/enums.ts` avec **exactement** les mêmes valeurs.

## 3. Schéma Drizzle et migration

1. Modifier `apps/api/src/db/schema.ts` pour qu'il reflète le document.
2. Générer la migration : `pnpm --filter api db:generate`, puis relire le SQL généré.
3. Ce que Drizzle ne génère pas (fonctions TimescaleDB `create_hypertable`, `add_retention_policy`, index partiels particuliers) va dans une migration SQL écrite à la main, dans le même dossier.
4. Ne jamais modifier une migration déjà fusionnée dans `main` : en créer une nouvelle.

## 4. Données existantes

- Une colonne `NOT NULL` ajoutée à une table non vide a besoin d'une valeur par défaut ou d'une migration de données.
- Mettre à jour `infra/seed/demo-site.json` et le script de seed si nécessaire.

## 5. Vérifier

- Sur une base vide : `db:migrate` puis `db:seed` sans erreur.
- Le schéma obtenu correspond au script SQL de référence (tables, contraintes, index).
- Les tests de l'API passent.
