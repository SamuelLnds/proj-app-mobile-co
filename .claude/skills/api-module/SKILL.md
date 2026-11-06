---
name: api-module
description: Créer ou modifier un module de l'API Fastify (apps/api) selon les conventions du projet - découpe routes/service/repository, validation par les schémas Zod de @solar/contracts, format d'erreur, rôles, tests. À utiliser pour toute route REST ou tout traitement de message MQTT côté API.
---

# Créer ou modifier un module de l'API

## Avant de coder

1. Repérer la route ou le traitement dans `docs/conception/03-cartographie-technique.md` (section 7 pour les routes, section 6 pour MQTT) et le comportement dans `docs/conception/02-uml.md`.
2. Vérifier que les schémas existent dans `packages/contracts/src/api/` (ou `mqtt/`). Sinon, les ajouter **d'abord** dans `contracts`, conformes à la cartographie.

## Structure d'un module

```
apps/api/src/modules/<module>/
├── routes.ts        # Déclaration des routes Fastify, rien d'autre
├── service.ts       # Règles métier
├── repository.ts    # Requêtes Drizzle
└── <module>.test.ts # Tests (fastify.inject et services)
```

- `routes.ts` : schémas d'entrée et de sortie via `fastify-type-provider-zod`, vérification du JWT et du rôle, appel au service, aucune requête SQL.
- `service.ts` : reçoit des valeurs déjà validées, applique les règles (seuils, transitions d'état), lève des erreurs applicatives (`src/errors.ts`).
- `repository.ts` : seule couche qui importe le client Drizzle.

## Règles

- Préfixe `/v1`, routes en anglais, `kebab-case`, ressources au pluriel.
- Rôle `operator` exigé côté API pour toute route qui modifie l'état (consignes, panneaux), même si l'app masque le bouton.
- Erreurs : lever l'erreur applicative correspondant au code (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `DEVICE_OFFLINE`, `INVALID_REQUEST`…) ; le gestionnaire central produit `{ error: { code, message, details } }`. Le `message` est en français, lisible par l'utilisateur.
- Constantes (délais, seuils) : toujours importées de `@solar/contracts`.
- Message MQTT reçu : validation par son schéma ; s'il est invalide, journaliser un avertissement (`fastify.log.warn`) et l'ignorer.
- Dates en UTC, au format ISO 8601 dans les réponses.
- Commentaires en français, uniquement quand le « pourquoi » n'est pas évident.

## Tests attendus

- Un test par critère d'acceptation de l'issue.
- Pour chaque route : cas nominal, 401 sans jeton, 403 si le rôle est insuffisant (routes `operator`), 422 sur une entrée invalide, 404 si la ressource n'existe pas.
- Les services se testent sans HTTP ; la base de test est celle de Docker Compose, remise à zéro entre les tests.

## Après

- Si une route, un champ ou un code d'erreur a changé : mettre à jour la section 7 de la cartographie dans la même pull request.
