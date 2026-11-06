# D002 · Périmètre volontairement réduit, bonus après le socle

| | |
|---|---|
| **Date** | 2026-11-06 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | [Étude de faisabilité](../../etude-faisabilite-parc-solaire.md), sections 2 et 10 |

## Contexte

Les premières explorations ont accumulé de nombreuses briques possibles : sécurité avancée (TLS mutuel, OTA signée, tests de pénétration), observabilité (OpenTelemetry), mode hors ligne complet, plusieurs boîtiers, flotte de centaines de panneaux, cartographie avancée (PostGIS), vue 3D. Le temps disponible est limité (module de 45 h 30, binôme ou trinôme).

## Options étudiées

| Critère | Périmètre étendu | Périmètre réduit + bonus |
|---|---|---|
| Charge estimée | ≈ 200 h | ≈ 70 h (socle) + ≈ 25 h (bonus) |
| Couverture des cinq gestes | Oui | Oui |
| Couverture des sept chapitres | Oui, en profondeur | Oui, au niveau attendu |
| Risque de ne pas finir | Élevé | Faible |
| Homogénéité du travail en groupe | Difficile (beaucoup de technologies) | Facile (peu de briques) |

## Décision

Le projet se limite à **une app, une API, une base et un objet simulé**. Les éléments hors socle sont des **bonus**, traités uniquement une fois le socle livré, dans un ordre fixé et avec un budget d'heures.

## Justification

Le périmètre réduit couvre toutes les attentes du module pour environ un tiers de la charge. Il laisse une marge pour les imprévus et pour les bonus.

## Conséquences

Retirés du socle : TLS mutuel, OTA signée, chiffrement au repos, tests de pénétration, OpenTelemetry, mode hors ligne complet, PostGIS, GraphQL, plusieurs boîtiers. Ils peuvent être cités dans le dossier comme pistes d'évolution.

Bonus retenus, dans l'ordre : vue 3D ([D013](D013-vue-3d-bonus.md)), puis rotation des panneaux, puis flux temps réel poussé (SSE).

## Sources

- Estimation de charge de l'étude de faisabilité
