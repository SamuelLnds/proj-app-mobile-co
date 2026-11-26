# D032 · Analyseur JSON minimal dans le firmware, à la place d'ArduinoJson

| | |
|---|---|
| **Date** | 2026-11-26 |
| **Statut** | Acceptée |
| **Décideurs** | À compléter |
| **Liens** | Issues #39, #40 · [Cartographie, section 5.5](../../conception/03-cartographie-technique.md) · [D024](D024-objet-simule-et-connexion-wokwi.md) |

## Contexte

L'objet doit lire la consigne `Setpoint` reçue sur `solar/SITE01/setpoint` (#40) : cinq champs d'un objet JSON plat produit par l'API (`JSON.stringify`). La cartographie prévoyait la bibliothèque ArduinoJson pour cela. Le critère de #40 demande de distinguer une consigne **invalide mais lisible** (réponse `rejected` / `invalid_setpoint` pour son identifiant) d'un message **illisible** (ignoré et journalisé). Le firmware est par ailleurs compilé sur le poste par les tests, qui comparent son comportement aux schémas Zod.

## Options étudiées

| Critère | ArduinoJson 7 | Analyseur minimal écrit pour le projet |
|---|---|---|
| Dépendance | Une bibliothèque de plus (téléchargée par PlatformIO) | Aucune |
| Test sur le poste | Demande l'en-tête de la bibliothèque dans l'environnement de test | Un seul fichier, compilé tel quel par le test |
| Validation (UUID, date, part multiple de 10, part obligatoire en manuel) | À écrire dans les deux cas | À écrire dans les deux cas |
| Robustesse | Éprouvée | À démontrer : le test compare ses verdicts à `SetpointSchema` sur des cas écrits à la main et sur 3 000 messages altérés au hasard |
| Mémoire | Allocation dynamique, document en mémoire | Aucune allocation, tampons de taille fixe |
| Taille de code | Plus importante | Environ 250 lignes |

## Décision

Un analyseur minimal, dans `firmware/site-device/include/setpoint.h` : grammaire JSON stricte (objet, chaînes avec échappements, nombres, `true`, `false`, `null`, valeurs imbriquées sautées), lecture des champs `v`, `id`, `mode`, `batteryShare` et `issuedAt`, ignorance des autres. Le verdict est `Valid`, `Invalid` (identifiant UUID lisible mais un champ faux) ou `Unreadable`. ArduinoJson est retirée de la conception.

## Justification

Le format est fermé et produit par notre propre API : un analyseur d'environ 250 lignes suffit, sans allocation. Surtout, il se compile sur le poste comme le reste de la logique, et un test compare ses verdicts à ceux du schéma Zod, qui fait foi : l'équivalence est vérifiée au lieu d'être supposée. La validation (UUID, date, bornes) était à écrire avec ArduinoJson aussi.

## Conséquences

- Aucune dépendance ajoutée dans `platformio.ini`.
- Si le format de `Setpoint` change, `setpoint.h` et son test (`tools/simulator/tests/firmware-control.test.ts`) sont à mettre à jour avec le skill `mqtt-message`.
- Un champ de type inattendu (nombre à la place d'une chaîne, par exemple) donne un verdict `Invalid`, comme avec le schéma Zod ; seul un identifiant illisible rend le message `Unreadable`.
- Limites connues : une chaîne de plus de 63 octets dans un champ lu est considérée comme invalide, et un échappement Unicode hors ASCII est remplacé par un octet de contrôle (aucun champ attendu n'en contient).

## Sources

- Schéma de référence : `packages/contracts/src/mqtt/messages.ts` (`SetpointSchema`).
