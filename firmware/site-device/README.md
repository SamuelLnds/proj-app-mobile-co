# Firmware de l'objet du site (ESP32)

Firmware PlatformIO (framework Arduino) de l'unique ESP32 du projet, simulé dans l'extension **Wokwi pour VS Code** ([D007](../../docs/journal/decisions/D007-objet-wokwi.md)). Il lit les capteurs, publie un `SiteMeasurement` toutes les 5 s sur le broker Mosquitto en TLS et annonce son statut (`online`, Last Will `offline`).

Fait dans ce dossier (issues #19, #20, #21) : montage, WiFi, heure NTP, MQTT TLS, mesures. Issues #38, #39 et #40 : batterie simulée, relais et barre de LED, algorithme de pilotage de la [section 7 de l'UML](../../docs/conception/02-uml.md), réception des consignes et publication de l'état appliqué. Ces trois issues sont vérifiées sur le poste par des tests ; leurs critères qui demandent Wokwi se contrôlent avec le scénario de la dernière section.

## Montage et broches

| Composant (Wokwi) | Broche du composant | Broche ESP32 | Rôle |
|---|---|---|---|
| Photorésistance (`wokwi-photoresistor-sensor`) | `AO` | GPIO 34 (ADC1) | Ensoleillement |
| | `VCC` / `GND` | 3V3 / GND | |
| Potentiomètre (`wokwi-potentiometer`) | `SIG` | GPIO 35 (ADC1) | Production, 0 à 4 000 W |
| | `VCC` / `GND` | 3V3 / GND | |
| DS18B20 (`wokwi-ds18b20`) | `DQ` | GPIO 4 | Température des panneaux |
| | `VCC` / `GND` | 3V3 / GND | |
| Résistance 4,7 kΩ (`wokwi-resistor`) | entre `DQ` et 3V3 | | Rappel (pull-up) du bus 1-Wire |
| Relais 1 (`wokwi-relay-module`) | `IN` | GPIO 26 | Charge de la batterie |
| Relais 2 (`wokwi-relay-module`) | `IN` | GPIO 27 | Injection sur le réseau |
| | `VCC` / `GND` (les deux relais) | 5V / GND | |
| Barre de LED (`wokwi-led-bar-graph`) | `A1` à `A10` | GPIO 16, 17, 18, 19, 21, 22, 23, 25, 32, 33 | Niveau de batterie (une LED par 10 %) |
| | `C1` à `C10` | GND | Sur un vrai montage, ajouter une résistance par LED |
| Bouton (`wokwi-pushbutton`) | `1.l` | GPIO 13 (rappel interne) | Panne simulée |
| | `2.l` | GND | |

Les entrées analogiques sont sur l'ADC1 : l'ADC2 est inutilisable quand le WiFi est actif. Les broches sont déclarées dans `include/pins.h` et câblées dans `diagram.json`.

## Fonctionnement

- **Ensoleillement** : la tension de `AO` baisse quand l'éclairement monte (LDR et résistance de 10 kΩ en série). Le firmware remonte à la résistance du LDR, puis aux lux avec la loi du module Wokwi (`rl10` 50 kΩ, `gamma` 0,7), puis aux W/m² (100 lux par W/m², donc environ 1 000 W/m² à 100 000 lux, le maximum du curseur Wokwi). Avec la valeur par défaut de 500 lux, l'ensoleillement est d'environ 4 W/m² : monter le curseur pour simuler du soleil.
- **Production** : position du potentiomètre, de 0 à 4 000 W (`DEMO_SITE_PEAK_POWER_W`), lue chaque seconde.
- **Pilotage (#38, #39)** : chaque seconde (`CONTROL_TICK_PERIOD_MS`), `Pilot` (`include/pilot.h`) met à jour la batterie par `nextBatteryLevel` (capacité 10 000 Wh, temps accéléré ×60, départ à 50 %), calcule les flux par `applyControl` (`include/control.h`, équivalent de `tools/simulator/src/device/control.ts`) et pilote les sorties : relais 1 (charge) fermé si la puissance de la batterie est positive, relais 2 (injection) fermé si la puissance réseau est positive, barre de LED = niveau (une LED par tranche de 10 %). Sans consigne, l'objet est en mode `automatic`. La mesure publiée toutes les 5 s reprend les valeurs du dernier tick : `production = batteryPower + gridPower`. La batterie avance au temps réel écoulé de l'ESP32 : dans Wokwi (environ 50 % du temps réel), 20 % à 95 % prend 150 s **simulées par le firmware**, donc environ 5 min de temps réel.
- **Consignes (#40)** : abonnement à `solar/SITE01/setpoint` en QoS 1 après chaque connexion ; le broker renvoie la consigne retained. `include/setpoint.h` lit le JSON (analyseur minimal, [D032](../../docs/journal/decisions/D032-analyseur-json-minimal-du-firmware.md)) et vérifie `v` = 1, `id` UUID, `mode`, `batteryShare` (entier de 0 à 100, multiple de 10, obligatoire en `manual`, `null` sinon) et `issuedAt`. Consigne valide : appliquée aussitôt (dans la seconde, sans attendre la mesure de 5 s) et état `ControlState` publié en retained. Consigne lisible mais invalide : `rejected` / `invalid_setpoint` pour son identifiant, la consigne en vigueur continue, puis son état est republié au tick suivant. Message illisible (JSON cassé, identifiant qui n'est pas un UUID) : ignoré et journalisé sur le port série. Consigne identique à celle en vigueur (renvoi après reconnexion) : aucun état republié. L'état en attente depuis le tick (état initial au démarrage, changement pendant une coupure) n'est publié que 1,5 s après la connexion (`STATE_SETTLE_AFTER_CONNECT_MS`), pour que la consigne retained soit lue d'abord et que l'état initial ne soit pas publié pour rien. Ensuite, un état est publié à chaque changement de part appliquée, de statut ou de raison (par exemple batterie qui atteint 95 %). Tampon MQTT de 512 octets (`MQTT_BUFFER_SIZE`), largement suffisant (consigne d'environ 130 octets, état d'environ 200).
- **Port série** : la ligne `Capteurs : …` est conservée ; s'y ajoutent `Consigne reçue : …`, `Consigne : manuel 70 % -> appliquée 70 %` (ou `appliquée en partie 75 % (limite de charge)`, `refusée (batterie pleine)`…), `État : …` à chaque changement et `État publié : {…}` avec le JSON envoyé.
- **Bouton de panne** : chaque appui bascule `simulatedFault` ; la production est alors divisée par 5.
- **Température** : DS18B20 (si la sonde ne répond pas, aucune mesure n'est publiée).
- **Messages** : `include/messages.h` construit les JSON de la section 6.2 de la [cartographie](../../docs/conception/03-cartographie-technique.md) ; une mesure hors bornes du schéma n'est pas publiée. `include/readings.h` convertit les lectures. Ces deux fichiers n'utilisent pas Arduino : ils sont aussi compilés sur le poste par le test.
- **Réseau** : WiFi `Wokwi-GUEST`, heure NTP avant tout TLS, MQTT TLS sur le port distant du tunnel avec le certificat de l'autorité du projet, identifiant `device-site01`. Last Will `{"v":1,"status":"offline"}` retained QoS 1, puis `online` avec la version du firmware. Reconnexion automatique du WiFi et de MQTT toutes les 5 s. Maintien MQTT de 60 s et resynchronisation NTP toutes les 60 s (voir « Dépannage »). PubSubClient ne publie qu'en QoS 0 : `online`, les mesures et l'état appliqué sont publiés en QoS 0 (les mesures sont en QoS 0 dans la conception ; `online` et `state` sont retained, mais la conception demande QoS 1 pour `state` : écart connu, voir « Limites »).
- **Constantes** : `include/config.h` reprend à l'identique celles de `packages/contracts/src/constants.ts` (vérifié par le test).

## Compiler

```
pip install platformio        # une fois (ou l'extension PlatformIO IDE de VS Code)
cd firmware/site-device
python -m platformio run
```

Le premier build télécharge la chaîne ESP32. Il produit `.pio/build/esp32dev/firmware.bin` et `firmware.elf`, lus par `wokwi.toml`. Le dossier `.pio/` n'est pas versionné.

## Tests sur le poste

`pnpm test` (dans `tools/simulator`) compile des programmes de `test/` avec un compilateur C++ du poste (`c++`, `g++`, `clang++` ou la variable `CXX`, par exemple `CXX="python -m ziglang c++"`) et compare leurs sorties aux contrats et au simulateur Node. Ils utilisent le **même code que le firmware** (`include/*.h`, sans Arduino). Sans compilateur C++ (poste Windows sans MinGW), ces tests sont ignorés ; la CI en dispose.

- `tests/firmware-format.test.ts` (programme `test/format/dump_messages.cpp`) : chaque mesure respecte `SiteMeasurementSchema` et `DeviceStatusSchema` (aucun champ en plus ou en moins), horodatage UTC, division par 5 en cas de panne ; `config.h` est identique à `constants.ts`.
- `tests/firmware-control.test.ts` (programmes `test/control/dump_control.cpp` et `parse_setpoint.cpp`) :
  - `applyControl` du firmware égale celui du simulateur (`src/device/control.ts`) sur une grille de plus de 20 000 entrées (modes × parts valides et invalides × niveaux × productions × puissances maximales) ;
  - chaque ligne du tableau « statut renvoyé » de la section 7 donne le `ControlState` attendu, valide pour `ControlStateSchema` ;
  - `nextBatteryLevel` égale celui du simulateur, et 20 % à 95 % avec 3 000 W prend 150 ticks d'une seconde (2 à 3 minutes) ;
  - un état n'est publié qu'au démarrage, à la réception d'une consigne nouvelle et au changement de part, de statut ou de raison ; la consigne retained renvoyée à la reconnexion ne republie rien ; une consigne invalide est refusée une fois ;
  - la lecture des consignes donne le même verdict que `SetpointSchema` (valide, invalide mais lisible, illisible) sur des cas écrits à la main et sur 3 000 messages altérés au hasard.

Cette approche a été retenue plutôt qu'un test PlatformIO `native` : elle ne demande aucun environnement PlatformIO supplémentaire, réutilise Zod directement et tourne dans `pnpm test`, donc en CI.

## Limites

- **QoS de `state`** : PubSubClient ne publie qu'en QoS 0, alors que la conception demande QoS 1 pour `solar/SITE01/state`. Aucun moyen sûr de publier en QoS 1 avec cette bibliothèque (écrire un paquet PUBLISH à la main sur le socket TLS contournerait la gestion des acquittements et du maintien de la connexion). Conséquence : si la connexion tombe juste après la publication, l'état peut être perdu ; l'API passe alors la consigne en `no_response` après 30 s, puis accepte une réponse tardive. L'abonnement aux consignes est bien en QoS 1. Une bibliothèque qui publie en QoS 1 (par exemple `256dpi/arduino-mqtt`) lèverait la limite.
- **Temps de la batterie** : elle avance au temps de l'ESP32 simulé, donc plus lentement que l'heure réelle dans Wokwi (voir « Dépannage »).
- **Analyseur JSON** maison ([D032](../../docs/journal/decisions/D032-analyseur-json-minimal-du-firmware.md)) : conçu pour le format fermé de `Setpoint`, comparé à Zod par les tests.

## Procédure de test avec Wokwi (à faire par le binôme)

Prérequis : Docker, bore ([`infra/README.md`](../../infra/README.md)), PlatformIO (`pip install platformio`), l'extension Wokwi pour VS Code connectée au compte du binôme, un client MQTT (`mosquitto_sub`).

1. **Broker** : copier `infra/.env.example` en `infra/.env`, choisir des mots de passe longs, mettre `MQTT_TLS_HOSTS=localhost,bore.pub`, puis `pnpm mqtt:setup` et `pnpm mqtt:up`.
2. **Tunnel** : dans un terminal à part, `bore local 8883 --to bore.pub` ; noter le port affiché (`bore.pub:<port>`).
3. **Secrets du firmware** : `pnpm firmware:secrets --host bore.pub --port <port>` (écrit `include/secrets.h`, ignoré par Git, sans rien afficher). Sans cette commande : copier `include/secrets.example.h` en `secrets.h` et le remplir à la main.
4. **Compilation** : `cd firmware/site-device` puis `python -m platformio run` (la commande `pio` n'est souvent pas dans le `PATH`).
5. **Simulation** : ne pas lancer `pnpm dev` avec `SIMULATE_DEVICE=true` (un seul émetteur pour `SITE01`). Lancer au besoin l'API et la base seulement. Dans VS Code, ouvrir `firmware/site-device`, F1 puis « Wokwi: Start Simulator ». Le port série affiche `Parc solaire - objet du site SITE01, firmware 0.1.0` (critère #19), puis la connexion WiFi, l'heure NTP et `MQTT : connecté, statut online publié`.
6. **Contrôle avec un client MQTT** (depuis la racine du dépôt) :
   `mosquitto_sub -h bore.pub -p <port> --cafile infra/mosquitto/generated/ca.crt --cert <certificat> --key <clé> -t "solar/SITE01/#" -v`, avec le certificat d'un objet accepté : depuis #80, l'écoute 8883 exige un certificat client ([D027](../../docs/journal/decisions/D027-certificat-objet-et-enrolement.md)). **L'ESP32 ne peut plus se connecter tant que l'enrôlement (#83) n'est pas fait.**
   Le statut `online` (retained) arrive tout de suite, puis une mesure toutes les 5 s. Si l'API tourne, la mesure apparaît aussi dans l'app.
7. **Capteurs** : déplacer le potentiomètre et le curseur de lux dans Wokwi : `production` et `irradiance` suivent. Appuyer sur le bouton : `simulatedFault` passe à `true` et la production est divisée par 5 ; un second appui la rétablit.
8. **Arrêt brutal** : arrêter la simulation (Stop) ou tuer le tunnel : après 90 s au plus (1,5 fois le maintien de 60 s), `solar/SITE01/status` passe à `{"v":1,"status":"offline"}`.
9. **Coupure réseau** : arrêter bore (Ctrl+C), attendre le message `MQTT : session perdue`, relancer bore. Si le port a changé, régénérer `secrets.h` et recompiler ; avec `bore local 8883 --to bore.pub --port <port>` le même port est redemandé et la simulation se reconnecte seule, `online` réapparaît.
10. **Vérification de format sur un message réel** : copier un message reçu à l'étape 6 et le passer à `SiteMeasurementSchema.parse(...)`.

### Scénario de pilotage (#38, #39, #40), à faire par le binôme

À faire après les étapes 1 à 6, avec l'API et l'app qui tournent (`pnpm --filter api dev`, app Expo connectée en exploitant) et, dans un terminal, le suivi complet des messages avec l'utilisateur `api` (qui peut tout lire) :
`mosquitto_sub -h bore.pub -p <port> --cafile infra/mosquitto/generated/ca.crt -u api -P "$MQTT_API_PASSWORD" -t "solar/SITE01/#" -v`
(`MQTT_API_PASSWORD` est la variable de `infra/.env`, à exporter dans le terminal : ne rien écrire en clair dans un fichier du dépôt.) Garder le **panneau Wokwi visible** et le moniteur série ouvert. La batterie démarre à 50 %. Les durées ci-dessous sont celles de l'ESP32 simulé : compter environ le double en temps réel.

Pour chaque étape : régler le potentiomètre, envoyer la consigne depuis l'écran **Pilotage** de l'app (Appliquer, confirmer), puis contrôler l'état affiché dans l'app, la ligne série, le message `solar/SITE01/state` et les sorties (barre de LED, relais 1 = charge, relais 2 = injection). La réponse doit venir **dans la seconde** (au plus 1 s de temps de l'ESP32), sans attendre la mesure de 5 s.

| Étape | Ligne du tableau « statut renvoyé » | Préparation | Consigne à envoyer | Résultat attendu |
|---|---|---|---|---|
| 0 | État initial (aucune consigne) | Potentiomètre à 50 % (2 000 W), redémarrer la simulation | Aucune | `state` : `setpointId` `null`, `automatic`, `applied`, part 100 ; 5 LED allumées ; relais 1 fermé, relais 2 ouvert (toute la production va à la batterie, `gridPower` 0) ; la batterie monte de 0,33 % par seconde |
| 1 | Manuel ou automatique, demande appliquée en entier | Potentiomètre à 50 % (2 000 W), batterie vers 50 % | Manuel, 50 % | App « Appliquée », part 50 ; série `Consigne : manuel 50 % -> appliquée 50 %` ; `state` `applied` / 50 / `null` ; mesure : `batteryPower` 1 000, `gridPower` 1 000 ; relais 1 et 2 fermés |
| 2 | Manuel, part réduite par la puissance de charge maximale | Potentiomètre à 100 % (4 000 W) | Manuel, 100 % | App « Appliquée en partie », 75 % ; série `-> appliquée en partie 75 % (limite de charge)` ; `state` `partial` / 75 / `charge_limit` ; `batteryPower` 3 000, `gridPower` 1 000 ; la batterie monte de 0,5 % par seconde |
| 3 | Manuel ou automatique, demande appliquée en entier (automatique) | Batterie sous 80 % | Automatique | `applied` / 100 / `null` ; la charge se poursuit ; **dès 80 %**, un nouvel état `applied` / part **0** est publié sans action (changement de part), relais 1 ouvert, barre à 8 LED |
| 4 | Manuel avec part > 0, batterie ≥ 95 % | Manuel 100 % à 4 000 W jusqu'à 95 % (un état `rejected` / 0 / `battery_full` est publié tout seul à 95 %) | Manuel, 50 % | App « Refusée : batterie pleine » ; `state` `rejected` / 0 / `battery_full` ; `batteryPower` 0, `gridPower` = production ; relais 1 ouvert, relais 2 fermé ; 10 LED allumées |
| 5 | Restitution avec batterie > 20 % | Batterie au-dessus de 20 % (par exemple 95 %) | Restitution | App « Appliquée » ; `state` `applied` / `null` / `null`, mode `discharge` ; `batteryPower` -3 000, `gridPower` = production + 3 000 ; relais 1 ouvert, relais 2 fermé ; la batterie baisse de 0,5 % par seconde |
| 6 | Restitution avec batterie ≤ 20 % | Laisser la restitution descendre : à 20 %, un état `rejected` / `null` / `battery_low` est publié tout seul | Restitution | App « Refusée : batterie faible » ; `state` `rejected` / `null` / `battery_low` ; `batteryPower` 0 ; 2 LED allumées |
| 7 | Production nulle (la part demandée est considérée comme appliquée) | Potentiomètre à 0 %, batterie entre 20 % et 95 % | Manuel, 100 % | `state` `applied` / 100 / `null` ; tous les flux à 0 ; relais 1 et 2 ouverts |
| 8 | Consigne mal formée ou hors bornes | Aucune (l'app ne peut pas envoyer de consigne invalide) | Publication manuelle, voir ci-dessous | `state` `rejected` / `null` / `invalid_setpoint` pour l'identifiant publié, série `Consigne : invalide -> refusée (consigne invalide)` ; la consigne précédente continue de s'appliquer et son état est republié environ 1 s plus tard |

Pour l'étape 8, depuis la racine du dépôt, avec une part qui n'est pas un multiple de 10 :

```
mosquitto_pub -h bore.pub -p <port> --cafile infra/mosquitto/generated/ca.crt -u api -P "$MQTT_API_PASSWORD" \
  -t solar/SITE01/setpoint -q 1 -r \
  -m '{"v":1,"id":"7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f","mode":"manual","batteryShare":15,"issuedAt":"2026-11-26T10:00:00Z"}'
```

Autres cas à publier de la même façon (changer l'`id` à chaque essai, sauf pour le premier cas du message illisible) : `"batteryShare":110`, `"mode":"boost"`, `"mode":"automatic"` avec `"batteryShare":50`, `"v":2` : tous donnent `invalid_setpoint`. Un message illisible (`-m '{"v":1,'`, ou un `id` qui n'est pas un UUID) ne produit **aucun** état : le moniteur série affiche `Consigne illisible, ignorée`. La consigne publiée avec `-r` reste retained : envoyer ensuite une consigne valide depuis l'app, ou l'effacer avec `mosquitto_pub … -t solar/SITE01/setpoint -r -n`. Comme l'API n'a pas créé cette consigne, elle n'en met pas à jour le statut : seul l'état courant du site change.

Contrôles de fin :

- **Reconnexion (critère de #40)** : après l'étape 1, arrêter bore, attendre `MQTT : session perdue`, le relancer (même port, étape 9 ci-dessus). Après `abonné à solar/SITE01/setpoint (QoS 1)`, le moniteur série affiche `Consigne reçue : …` suivi de `Consigne : identique à celle en vigueur, rien à publier` et **aucun** nouvel état n'est publié ; un redémarrage complet de la simulation, lui, applique la consigne retained (`Consigne : manuel 50 % -> appliquée 50 %`) puis publie son état.
- **Critère de #38** : mettre la batterie à environ 20 % (restitution jusqu'au refus `battery_low`), potentiomètre à 75 % (3 000 W), envoyer Manuel 100 % : le niveau passe de 20 % à 95 % en environ 150 s de temps de l'ESP32 (2 à 3 minutes ; environ 5 min de temps réel dans Wokwi) et la barre de LED suit.
- **Format** : copier un `state` reçu et le passer à `ControlStateSchema.parse(...)`.

Points à surveiller lors de ce test : l'étalonnage de la photorésistance et de l'ADC dans Wokwi (valeurs de `irradiance` attendues), le nom exact des broches du composant `board-esp32-devkit-c-v4` dans `diagram.json` (l'extension signale une broche inconnue au démarrage), et le temps de connexion TLS.

## Dépannage

Wokwi simule l'ESP32 **plus lentement que le temps réel**, environ 50 % de la vitesse, parfois moins si le panneau du simulateur est caché. Deux effets en découlent, déjà corrigés dans le firmware, mais qu'il faut connaître :

- **Déconnexions MQTT** (`Client device-site01 disconnected: exceeded timeout` dans le journal de Mosquitto). Le PINGREQ partait trop tard pour un maintien de 15 s. Le maintien est maintenant de 60 s (`MQTT_KEEPALIVE_S`). Conséquence : après un arrêt brutal, `offline` n'apparaît qu'après 90 s au plus. Si les coupures reviennent, vérifier que le panneau du simulateur est visible.
- **Horloge en retard.** L'horloge de l'ESP32 avance au rythme simulé, donc plus lentement que l'heure réelle : sans correction, les horodatages des mesures accumulent du retard (environ 2 min 30 après quelques minutes). L'heure est donc resynchronisée par NTP toutes les 60 s (`NTP_RESYNC_INTERVAL_MS`). Entre deux synchronisations, le retard reste de l'ordre de la minute. Au-delà de 300 s (`MAX_CLOCK_DRIFT_S`), l'API remplace l'horodatage par l'heure de réception.

Dans les deux cas : **laisser le panneau du simulateur Wokwi visible** pendant les tests.
