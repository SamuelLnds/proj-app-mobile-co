# @solar/contracts

Formats échangés par le projet, définis **une seule fois** et importés par l'API, l'app et le simulateur ([D011](../../docs/journal/decisions/D011-monorepo-contrats.md)) : schémas Zod et types TypeScript des messages MQTT et de l'API REST, énumérations, topics, constantes partagées. Aucune logique métier.

| Fichier             | Contenu                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/enums.ts`      | Énumérations, aux valeurs identiques à celles de la base ([modèle de données](../../docs/conception/01-modele-donnees.md), section 3)          |
| `src/constants.ts`  | Constantes partagées (seuils, délais, site de démonstration, enrôlement), recopiées à l'identique dans `firmware/site-device/include/config.h` |
| `src/primitives.ts` | Briques de validation : dates ISO 8601 UTC, pourcentages, températures, part de batterie                                                       |
| `src/mqtt/`         | Messages MQTT (`SiteMeasurement`, `PanelMeasurement`, `Setpoint`, `ControlState`, `DeviceStatus`) et topics                                    |
| `src/api/`          | Requêtes et réponses REST par domaine, codes d'erreur, table des routes `ROUTES` (méthode, chemin, rôle, schémas)                              |

Référence : sections 6 à 8 de la [cartographie technique](../../docs/conception/03-cartographie-technique.md). Tout changement de format passe d'abord par la documentation (skills `mqtt-message`, `db-change`).

## Commandes

| Commande                            | Effet                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter contracts test`      | Tests : chaque schéma exporté a un exemple accepté et un exemple refusé (`tests/all-schemas.test.ts`, table complète par construction), plus les règles particulières (consignes, topics, routes) |
| `pnpm --filter contracts typecheck` | Types                                                                                                                                                                                             |

Le paquet n'est pas compilé : il est importé en TypeScript par les autres paquets du dépôt (`"@solar/contracts": "workspace:*"`).
