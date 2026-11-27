# D037 · Flux temps réel par Server-Sent Events, qui signale les changements

| | |
|---|---|
| **Date** | 2026-11-27 |
| **Statut** | Proposée (à valider par le binôme à la relecture de #60) |
| **Décideurs** | Le binôme |
| **Liens** | Issue [#60](https://github.com/SamuelLnds/proj-app-mobile-co/issues/60) (bonus) · Précise [D010](D010-api-rest-fastify.md) · [Cartographie, section 7.4](../../conception/03-cartographie-technique.md) · [UML, section 4.2](../../conception/02-uml.md) |

## Contexte

[D010](D010-api-rest-fastify.md) retient l'interrogation périodique pour le socle et un flux SSE en bonus. L'app interroge l'API toutes les 5 à 30 s selon l'écran ; un exploitant consomme environ 90 kB par minute app ouverte (dossier technique, « Performance »). Le bonus demande qu'une nouvelle mesure soit affichée en moins de 2 s et qu'une coupure du flux ne bloque pas l'app.

## Options étudiées

| Critère | Le flux porte les données | Le flux signale les changements (retenue) |
|---|---|---|
| Formats à définir et tenir à jour | Un par type de donnée, en double des réponses REST | Un seul petit événement `{ topic, siteCode }` |
| Cohérence avec la copie locale (SQLite) et le cache | À recoder pour chaque donnée | Inchangée : l'app relit par les routes REST, qui alimentent déjà le cache et la copie locale |
| Volume | Plus faible (pas de requête de relecture) | Une requête de relecture par changement, mais aucune requête inutile entre deux changements |
| Repli en cas de coupure | Deux chemins de données à garder justes | Le même chemin qu'avant : l'interrogation périodique reprend |

| Critère | `EventSource` d'une bibliothèque (`react-native-sse`) | Client minimal sur `XMLHttpRequest` (retenu) |
|---|---|---|
| Dépendance | Une de plus | Aucune |
| En-tête `Authorization` | Oui | Oui |
| Taille | Bibliothèque complète | Une centaine de lignes, testées (découpage des événements, battement, reconnexion) |

## Décision

`GET /v1/events` (rôle `viewer`) envoie, en Server-Sent Events, des **signaux de changement** par `topic` (`site`, `panels`, `alerts`, `enrollments`), regroupés sur 250 ms, et un battement toutes les `STREAM_HEARTBEAT_S` (15 s). L'app relit les requêtes concernées par les routes REST. Tant que le flux est ouvert, l'interrogation périodique passe à 60 s (filet de sécurité) ; s'il se coupe (erreur, fin, deux battements manqués), elle reprend aussitôt et l'app rouvre le flux, de 3 s à 30 s d'attente entre deux essais. Le client SSE de l'app est écrit sur `XMLHttpRequest`, sans dépendance.

## Justification

Signaler plutôt que transporter garde un seul chemin de données, déjà testé : routes REST, cache TanStack Query, copie SQLite. Le flux n'est qu'un accélérateur, et sa coupure ramène exactement au comportement du socle. Le regroupement sur 250 ms évite vingt relectures quand les panneaux publient ensemble, tout en restant loin des 2 s exigées. React Native n'a pas d'`EventSource` ; `XMLHttpRequest` reçoit le texte au fil de l'eau et accepte l'en-tête du JWT, ce qui suffit.

## Conséquences

- Nouvelle route `GET /v1/events`, nouvel objet `StreamEvent`, nouvelle constante `STREAM_HEARTBEAT_S` (contrats et cartographie).
- L'API garde un bus d'événements en mémoire ; avec plusieurs instances de l'API, il faudrait un bus partagé (hors périmètre).
- Derrière Caddy (#54), le flux doit traverser le proxy sans mise en mémoire tampon (en-tête `X-Accel-Buffering: no`, envoi immédiat de chaque événement).
- Un JWT expiré ferme le flux à la reconnexion suivante (401), comme pour les autres routes.

## Sources

- [WHATWG, Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [Fastify, réponse brute et `reply.hijack()`](https://fastify.dev/docs/latest/Reference/Reply/#hijack)
