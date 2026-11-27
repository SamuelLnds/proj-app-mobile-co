# Dossier technique

Ce dossier rassemble les éléments techniques du projet pour la soutenance. La conception détaillée reste dans [`conception/`](conception/README.md) et les choix dans le [journal des décisions](journal/README.md). Les autres parties du dossier (architecture, installation, exploitation) seront ajoutées avec la documentation technique (#55).

## Performance

Indicateurs tirés de la télémétrie que le système enregistre déjà ([#110](conception/04-besoins-fonctionnels.md)) : aucune table, aucune route ni aucune dépendance n'a été ajoutée, seulement des requêtes en lecture sur les données existantes.

### Recalculer les indicateurs

```powershell
pnpm perf:report -- --from 2026-11-27T10:00:00Z --to 2026-11-27T11:00:00Z --log api.log
```

- `--from`, `--to` : période étudiée (ISO 8601) ; par défaut, les dernières 24 heures.
- `--log` (facultatif) : journal de l'API au format JSON, pour les temps de réponse. Fastify écrit du JSON hors développement : lancer l'API avec `NODE_ENV=production` et rediriger sa sortie, par exemple `$env:NODE_ENV="production"; pnpm --filter api dev > api.log`. Sur le VPS (#54), le journal du conteneur de l'API (`docker compose logs api`) convient tel quel.

La commande exécute [`infra/perf/indicators.sql`](../infra/perf/indicators.sql) avec `psql` dans le conteneur de la base (lecture seule), puis lit le journal avec [`infra/perf/report.mjs`](../infra/perf/report.mjs). Elle n'affiche aucun secret.

| Indicateur | Calcul | Attendu |
|---|---|---|
| Latence d'une consigne | `responded_at - created_at` de `setpoints`, par statut : médiane, 95e centile, maximum | Réponse de l'objet en moins de 30 s (`SETPOINT_RESPONSE_TIMEOUT_S`), en pratique dans la seconde |
| Régularité des mesures du site | Écart entre deux lignes successives de `site_measurements` : médiane, 95e centile, maximum ; part de mesures manquantes (écart de plus de 1,5 période) | 5 s (`SITE_MEASUREMENT_PERIOD_S`) |
| Régularité des mesures des panneaux | Même calcul sur `panel_measurements`, par panneau | 10 s (`PANEL_MEASUREMENT_PERIOD_S`) |
| Détection d'un objet hors ligne | Dernière mesure reçue du site, puis ouverture de l'alerte `device_offline` | Moins de 70 s (silence de 60 s et passage du planificateur toutes les 10 s) |
| Alertes | Nombre ouvert par type, encore actives, durée moyenne avant résolution | |
| Volume stocké | Lignes et taille de chaque hypertable (`hypertable_size`) | Rétention de 30 jours |
| Temps de réponse de l'API | `responseTime` du journal Fastify, par route : médiane et 95e centile | |

### Valeurs mesurées

Session locale du 27 novembre 2026 (poste de développement Windows, Docker Desktop, API et simulateur en mode objet du site, enrôlé par certificat, sans Wokwi ni tunnel), sur la journée :

| Indicateur | Valeur | Attendu |
|---|---|---|
| Écart entre mesures du site | 5,04 s en médiane et au 95e centile, aucune manquante (session courte, 5 mesures) | 5 s |
| Écart entre mesures des panneaux | 10,01 s en médiane, 10,02 s au 95e centile, aucune manquante (20 panneaux, environ 4 000 mesures) | 10 s |
| Détection d'un objet hors ligne | 65 s, après la révocation de l'objet simulé | moins de 70 s |
| Temps de réponse de l'API | `GET /v1/health` 2,3 ms (médiane), 8 ms (95e centile) ; `GET /v1/sites` sans jeton 0,7 ms ; `GET /v1/enrollments/{fingerprint}` 14 ms | |
| Volume | `panel_measurements` 4 080 lignes, 616 kB ; `site_measurements` 56 kB | |
| Latence des consignes | aucune consigne sur la période | moins de 30 s |

**Limites** : cette session est courte et locale. Les valeurs à présenter seront celles d'une session de démonstration sur le VPS (#54), avec l'ESP32 de Wokwi et des consignes envoyées depuis l'app, recalculées par la même commande. Avec Wokwi, l'écart entre mesures du site sera plus grand que 5 s : l'ESP32 est simulé plus lentement que le temps réel (environ 50 %, voir le README du firmware).

### Côté app : interrogations de l'API

Fréquences relevées dans le code ([`apps/mobile/src/api/hooks.ts`](../apps/mobile/src/api/hooks.ts)) et tailles des réponses mesurées avec la source `mock`, qui renvoie les mêmes objets que l'API (données de démonstration, 20 panneaux) :

| Requête | Écran | Période | Taille | Débit |
|---|---|---|---|---|
| `GET /v1/sites/{id}` | Supervision, Pilotage | 5 s (2 s pendant l'attente d'une consigne, 60 s au plus) | 1,1 kB | 12,7 kB/min |
| `GET /v1/sites/{id}/measurements` | Supervision (courbe 24 h) | 30 s | 13,6 kB (24 h), 9,2 kB (1 h) | 27,3 kB/min |
| `GET /v1/alerts?status=active` | Pastille de l'onglet Alertes, bandeau, écran Alertes | 5 s | 0,9 kB | 10,5 kB/min |
| `GET /v1/enrollments` | Supervision et Objets (exploitant seulement) | 5 s | 0,9 kB | 10,6 kB/min |
| `GET /v1/sites/{id}/panels` | Carte | 10 s | 4,8 kB | 28,7 kB/min |
| `GET /v1/panels/{id}` | Détail d'un panneau | 10 s | 0,3 kB | 1,7 kB/min |
| Courbe d'un panneau, historique des consignes, liste des sites | | au chargement seulement | | |

Expo Router garde montés les onglets déjà visités : app ouverte, un exploitant qui a parcouru tous les onglets consomme environ 90 kB par minute, soit environ 5,4 MB par heure. **En arrière-plan, rien** : TanStack Query suit l'état de l'app et suspend toute interrogation (#111).

Pistes d'économie, non retenues pour le socle : interroger les demandes d'enrôlement toutes les 30 s plutôt que 5 s (une demande reste valable 30 min) ; ne rafraîchir la courbe de 24 h qu'au quart d'heure, son pas d'agrégation ; ne pas interroger les onglets masqués ; un flux poussé (bonus #60) supprimerait l'essentiel de ces interrogations.
