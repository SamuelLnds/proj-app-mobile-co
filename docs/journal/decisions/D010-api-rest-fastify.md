# D010 · API : REST avec Fastify, sans GraphQL

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | [Cartographie technique](../../conception/03-cartographie-technique.md), section 7 |

## Contexte

Le module évoque une API REST ou GraphQL avec abonnements. Il faut aussi choisir le framework serveur et la manière de transmettre le « temps réel » à l'app.

## Options étudiées

**Style d'API**

| Critère | REST + interrogation périodique | REST + SSE | GraphQL + abonnements |
|---|---|---|---|
| Complexité | Faible | Moyenne | Élevée (schéma, résolveurs, WebSocket) |
| Temps réel | Rafraîchissement toutes les 2 à 5 s | Poussé | Poussé |
| Outillage côté app | `fetch` + TanStack Query | Idem + flux | Client GraphQL dédié |
| Adapté au volume (1 site, quelques utilisateurs) | Oui | Oui | Surdimensionné |

**Framework**

| Critère | Express | Fastify | NestJS |
|---|---|---|---|
| Validation des schémas intégrée | Non | Oui (et Zod via un adaptateur) | Oui (décorateurs) |
| Tests sans serveur réel | Avec une bibliothèque tierce | `inject()` intégré | Oui |
| Courbe d'apprentissage | Faible | Faible | Élevée |
| Structure imposée | Aucune | Légère (plugins) | Forte |

## Décision

**API REST avec Fastify** ; temps réel par **interrogation périodique** dans le socle, flux SSE en bonus.

## Justification

Le besoin temps réel (quelques secondes de latence acceptables) ne justifie pas GraphQL. Fastify apporte la validation et les tests intégrés sans la lourdeur de NestJS.

## Conséquences

- Préfixe `/v1`, format d'erreur unique, JWT 8 h.
- L'app interroge l'API toutes les 5 s (toutes les 2 s pendant l'attente d'une réponse à une consigne).
