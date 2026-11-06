# D014 · Stockage local de l'app : SQLite, avec TanStack Query pour le réseau

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | [Cartographie technique](../../conception/03-cartographie-technique.md), sections 4 et 5.3 |

## Contexte

L'app doit afficher les dernières données reçues quand le réseau est absent, avec leur ancienneté. Le groupe préfère SQLite pour le stockage local. Il faut aussi décider comment l'app interroge l'API (rafraîchissement toutes les 5 s, toutes les 2 s pendant l'attente d'une consigne).

Ces deux besoins sont distincts : **interroger l'API** (réseau) et **conserver des données sur le téléphone** (stockage).

## Options étudiées

| Critère | TanStack Query + AsyncStorage | SQLite seul (`expo-sqlite`) | TanStack Query + SQLite |
|---|---|---|---|
| Rafraîchissement périodique, nouvelle tentative, états de chargement | Fournis | À écrire à la main | Fournis |
| Stockage local structuré (listes, historique, requêtes) | Non (clé-valeur) | Oui | Oui |
| Données consultables sans réseau | Dernières réponses seulement | Oui | Oui |
| Code à écrire | Faible | Élevé (logique réseau maison) | Moyen |
| Pratique en entreprise | Courante | Courante pour le hors ligne | Courante |

## Décision

**TanStack Query pour les appels à l'API, SQLite (`expo-sqlite`) pour le stockage local.** Chaque réponse reçue est enregistrée dans SQLite ; les écrans lisent SQLite en priorité, puis se mettent à jour quand une nouvelle réponse arrive.

## Justification

SQLite répond au souhait du groupe et au besoin hors ligne. TanStack Query évite de réécrire la logique de rafraîchissement, de nouvelle tentative et d'état de chargement.

## Conséquences

- Dossier `apps/mobile/src/storage/` : schéma de la base locale et fonctions de lecture et d'écriture.
- Le JWT reste dans `expo-secure-store`, jamais dans SQLite.
- Option « SQLite seul » écartée par le groupe le 2026-11-06.
