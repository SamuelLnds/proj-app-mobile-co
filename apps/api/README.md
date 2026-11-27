# API (Fastify)

L'API reçoit les messages MQTT de l'objet et du simulateur, les enregistre dans PostgreSQL + TimescaleDB, calcule les alertes, envoie les notifications push et les consignes, délivre les certificats des objets, et sert l'app mobile en REST (JWT). Elle est la seule à parler à la base et, avec le simulateur, au broker par l'écoute locale.

Références : routes, codes d'erreur et variables dans la [cartographie technique](../../docs/conception/03-cartographie-technique.md) (sections 5.2, 7 et 9), comportements dans l'[UML](../../docs/conception/02-uml.md), tables dans le [modèle de données](../../docs/conception/01-modele-donnees.md).

## Lancer

Depuis la racine du dépôt, la base et le broker démarrés (voir le [README racine](../../README.md), §2) :

```powershell
pnpm --filter api db:migrate
pnpm --filter api db:seed
pnpm --filter api dev
```

L'API écoute sur le port 3000 (`PORT`), sur toutes les interfaces. Les variables sont dans `apps/api/.env` (copie de `.env.example`, jamais versionnée). Une variable manquante ou invalide arrête le démarrage avec la liste des corrections (`src/config.ts`).

## Organisation

```
src/
├── index.ts        Point d'entrée : configuration, serveur, client MQTT, planificateur, synchronisation du broker
├── server.ts       Instance Fastify : validation Zod, format d'erreur unique, routes sous /v1
├── config.ts       Variables d'environnement
├── errors.ts       Erreur applicative et messages français par code
├── scheduler.ts    Toutes les 10 s : objets silencieux, consignes sans réponse, demandes et certificats échus
├── db/             Schéma Drizzle, client, migrations, seed
├── mqtt/           Connexion au broker, aiguillage des messages vers les services
└── modules/        Un dossier par domaine : routes.ts (HTTP), service.ts (règles), repository.ts (requêtes)
    ├── auth/           Connexion, JWT, rôles
    ├── sites/ panels/ history/ measurements/ devices/
    ├── setpoints/      Envoi d'une consigne, réponse de l'objet, délai de réponse
    ├── alerts/         Moteur de règles (engine.ts) et consultation
    ├── notifications/  Jetons push et envoi Expo
    └── enrollment/     Enrôlement des objets : signature (authority.ts), ACL et liste de révocation (broker.ts)
```

Une route n'accède jamais à la base : elle valide l'entrée avec le schéma de `@solar/contracts`, puis appelle le service.

## Commandes

| Commande                                   | Effet                                                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter api dev`                    | API avec rechargement automatique                                                                                            |
| `pnpm --filter api test`                   | Tests, avec mesure de la couverture des services (moins de 80 % sur `setpoints`, `alerts`, `measurements` ou `auth` : échec) |
| `pnpm --filter api typecheck` · `lint`     | Types et lint                                                                                                                |
| `pnpm --filter api db:generate`            | Migration Drizzle après une modification de `src/db/schema.ts` (skill `db-change`)                                           |
| `pnpm --filter api db:migrate` · `db:seed` | Migrations et données de démonstration                                                                                       |

Les tests n'ont besoin ni de la base ni du broker : les dépôts et les envois sont remplacés par des versions en mémoire. `TEST_DATABASE_URL` active en plus les tests sur une base réelle.

## Enrôlement des objets

L'API signe les certificats des objets avec l'autorité créée par `pnpm mqtt:setup` ([D035](../../docs/journal/decisions/D035-signature-des-certificats-par-l-api.md)). La clé de l'autorité (`DEVICE_CA_KEY_PATH`) n'est lue qu'au moment de signer. À chaque décision et au démarrage, l'ACL des objets et la liste de révocation sont regénérées depuis la base, puis le broker est rechargé (`BROKER_RELOAD_COMMAND`, par Docker en développement) : Docker doit tourner. Sinon, la décision reste enregistrée et l'API répond `503 BROKER_UNAVAILABLE`.
