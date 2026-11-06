---
name: mqtt-message
description: Ajouter ou modifier un message ou un topic MQTT du projet en gardant cohérents la documentation, les schémas Zod de @solar/contracts, l'API, le simulateur et le firmware ESP32. À utiliser dès qu'un format échangé avec l'objet ou le simulateur change.
---

# Ajouter ou modifier un message MQTT

Un message MQTT est utilisé par jusqu'à quatre programmes. Un changement oublié à un seul endroit casse la communication sans erreur visible : suivre **toutes** les étapes, dans l'ordre.

## 1. Documentation d'abord

Dans `docs/conception/03-cartographie-technique.md`, section 6 :
- 6.1 : topic, émetteur, abonné, QoS, retained, fréquence ;
- 6.2 : tableau des champs (type, unité, bornes) et exemple JSON ;
- si un comportement change, mettre à jour la séquence correspondante dans `02-uml.md`.

Règles de format : JSON UTF-8, champs en `camelCase` anglais, champ `v` (version de format). Un changement **incompatible** (champ supprimé, renommé ou dont le sens change) incrémente `v`.

## 2. Contrats

Dans `packages/contracts/src/mqtt/` :
- `messages.ts` : schéma Zod avec toutes les bornes de la documentation ;
- `topics.ts` : fonction de construction et d'analyse du topic ;
- tests : l'exemple JSON de la documentation est accepté ; une valeur hors bornes et un `v` inconnu sont refusés.

## 3. API

- Abonnement dans `apps/api/src/mqtt/client.ts` si le topic est nouveau.
- Aiguillage dans `mqtt/handlers.ts` vers le service concerné ; un message invalide est journalisé puis ignoré.
- Publication (consignes) uniquement via la fonction de construction du topic, jamais une chaîne écrite à la main.

## 4. Simulateur

Si le message est émis ou lu par `tools/simulator`, l'adapter avec les mêmes fonctions de `@solar/contracts`.

## 5. Firmware

Le firmware C++ ne peut pas importer les schémas :
- reproduire exactement les noms de champs, types et bornes dans `firmware/site-device` (ArduinoJson) ;
- si une constante est concernée, la recopier à l'identique dans `include/config.h` ;
- vérifier un message réel publié depuis Wokwi en le passant au schéma Zod (test ou script).

## 6. Vérifier

- `pnpm test` (contrats et API) passe.
- Un message réel de bout en bout est reçu et enregistré par l'API.
