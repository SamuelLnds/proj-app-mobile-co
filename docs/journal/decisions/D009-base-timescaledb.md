# D009 · Base : PostgreSQL + TimescaleDB

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | [Modèle de données](../../conception/01-modele-donnees.md) |

## Contexte

La carte du module propose pour la rétention : InfluxDB, TimescaleDB, ou plus simple. Le projet stocke à la fois des **données relationnelles** (utilisateurs, sites, panneaux, consignes, alertes) et des **séries temporelles** (≈ 190 000 mesures par jour).

## Options étudiées

| Critère | PostgreSQL seul | PostgreSQL + TimescaleDB | InfluxDB | QuestDB |
|---|---|---|---|---|
| Données relationnelles | Oui | Oui | Non (deuxième base nécessaire) | Limité |
| Séries temporelles | Possible, sans outil dédié | Tables partitionnées, `time_bucket()`, rétention automatique | Spécialisé | Spécialisé, très rapide |
| Langage de requête | SQL | SQL | Flux / InfluxQL / SQL selon la version | SQL |
| Outillage TypeScript (ORM, migrations) | Excellent | Excellent (c'est du PostgreSQL) | Client dédié | Limité |
| Une seule base à opérer | Oui | Oui | Non | Non |

## Décision

**PostgreSQL avec l'extension TimescaleDB**.

## Justification

Une seule base pour tout, en SQL, avec les fonctions utiles aux séries temporelles (agrégation par intervalle, rétention de 30 jours) pour un coût de mise en œuvre quasi nul par rapport à PostgreSQL seul.

## Conséquences

- Image Docker `timescale/timescaledb`.
- Les commandes propres à TimescaleDB sont écrites dans une migration SQL manuelle (l'ORM ne les génère pas).
- L'hébergement de démonstration doit permettre l'extension TimescaleDB (point ouvert).
