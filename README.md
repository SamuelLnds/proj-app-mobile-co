# proj-app-mobile-co

Application mobile de supervision et de pilotage d'un petit parc solaire. Voir `docs/` pour la conception et `CLAUDE.md` pour les règles de travail.

## Démarrage

Prérequis : Node.js 22 (voir `.nvmrc`) et pnpm 10 (`corepack enable` active la version fixée par `packageManager`).

```sh
pnpm install        # installe les dépendances de tous les paquets
pnpm dev            # provisoire : sera complété (base, API, simulateur)
pnpm lint           # ESLint
pnpm typecheck      # vérification TypeScript
pnpm test           # tests
pnpm format         # formate le code avec Prettier
```
