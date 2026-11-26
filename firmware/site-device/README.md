# Firmware de l'objet du site (ESP32)

Firmware PlatformIO (framework Arduino) de l'unique ESP32 du projet, simulé dans l'extension **Wokwi pour VS Code** ([D007](../../docs/journal/decisions/D007-objet-wokwi.md)). Il lit les capteurs, publie un `SiteMeasurement` toutes les 5 s sur le broker Mosquitto en TLS et annonce son statut (`online`, Last Will `offline`).

Fait dans ce dossier (issues #19, #20, #21) : montage, WiFi, heure NTP, MQTT TLS, mesures. Pas encore fait : batterie simulée (#38), algorithme de pilotage (#39), consignes et état appliqué (#40) ; la batterie et les flux sont donc fixes (niveau 50 %, batterie 0 W, tout le courant vers le réseau, mode `automatic`).

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
- **Production** : position du potentiomètre, de 0 à 4 000 W (`DEMO_SITE_PEAK_POWER_W`).
- **Bouton de panne** : chaque appui bascule `simulatedFault` ; la production est alors divisée par 5.
- **Température** : DS18B20 (si la sonde ne répond pas, aucune mesure n'est publiée).
- **Messages** : `include/messages.h` construit les JSON de la section 6.2 de la [cartographie](../../docs/conception/03-cartographie-technique.md) ; une mesure hors bornes du schéma n'est pas publiée. `include/readings.h` convertit les lectures. Ces deux fichiers n'utilisent pas Arduino : ils sont aussi compilés sur le poste par le test.
- **Réseau** : WiFi `Wokwi-GUEST`, heure NTP avant tout TLS, MQTT TLS sur le port distant du tunnel avec le certificat de l'autorité du projet, identifiant `device-site01`. Last Will `{"v":1,"status":"offline"}` retained QoS 1, puis `online` avec la version du firmware. Reconnexion automatique du WiFi et de MQTT toutes les 5 s. PubSubClient ne publie qu'en QoS 0 : `online` et les mesures sont publiés en QoS 0 (les mesures sont en QoS 0 dans la conception ; `online` est retained).
- **Constantes** : `include/config.h` reprend à l'identique celles de `packages/contracts/src/constants.ts` (vérifié par le test).

## Compiler

```
pip install platformio        # une fois (ou l'extension PlatformIO IDE de VS Code)
cd firmware/site-device
pio run
```

Le premier build télécharge la chaîne ESP32. Il produit `.pio/build/esp32dev/firmware.bin` et `firmware.elf`, lus par `wokwi.toml`. Le dossier `.pio/` n'est pas versionné.

## Test de format des messages

`pnpm test` (dans `tools/simulator`) exécute `tests/firmware-format.test.ts` : il compile `test/format/dump_messages.cpp` avec un compilateur C++ du poste (`c++`, `g++`, `clang++` ou la variable `CXX`), produit des messages avec le **même code que le firmware** et les passe à `SiteMeasurementSchema` et `DeviceStatusSchema` de `@solar/contracts`. Il vérifie aussi le champ par champ (aucun champ en plus ou en moins), l'horodatage UTC, la division par 5 en cas de panne, et que `config.h` est identique à `constants.ts`. Sans compilateur C++ (poste Windows sans MinGW), les tests de messages sont ignorés ; la CI en dispose.

Cette approche a été retenue plutôt qu'un test PlatformIO `native` : elle ne demande aucun environnement PlatformIO supplémentaire, réutilise Zod directement et tourne dans `pnpm test`, donc en CI.

## Procédure de test avec Wokwi (à faire par le binôme)

Prérequis : Docker, bore ([`infra/README.md`](../../infra/README.md)), PlatformIO (`pip install platformio`), l'extension Wokwi pour VS Code connectée au compte du binôme, un client MQTT (`mosquitto_sub`).

1. **Broker** : copier `infra/.env.example` en `infra/.env`, choisir des mots de passe longs, mettre `MQTT_TLS_HOSTS=localhost,bore.pub`, puis `pnpm mqtt:setup` et `pnpm mqtt:up`.
2. **Tunnel** : dans un terminal à part, `bore local 8883 --to bore.pub` ; noter le port affiché (`bore.pub:<port>`).
3. **Secrets du firmware** : `pnpm firmware:secrets --host bore.pub --port <port>` (écrit `include/secrets.h`, ignoré par Git, sans rien afficher). Sans cette commande : copier `include/secrets.example.h` en `secrets.h` et le remplir à la main.
4. **Compilation** : `cd firmware/site-device && pio run`.
5. **Simulation** : ne pas lancer `pnpm dev` avec `SIMULATE_DEVICE=true` (un seul émetteur pour `SITE01`). Lancer au besoin l'API et la base seulement. Dans VS Code, ouvrir `firmware/site-device`, F1 puis « Wokwi: Start Simulator ». Le port série affiche `Parc solaire - objet du site SITE01, firmware 0.1.0` (critère #19), puis la connexion WiFi, l'heure NTP et `MQTT : connecté, statut online publié`.
6. **Contrôle avec un client MQTT** (depuis la racine du dépôt) :
   `mosquitto_sub -h bore.pub -p <port> --cafile infra/mosquitto/generated/ca.crt -u device-site01 -P <mot de passe> -t "solar/SITE01/#" -v`
   Le statut `online` (retained) arrive tout de suite, puis une mesure toutes les 5 s. Si l'API tourne, la mesure apparaît aussi dans l'app.
7. **Capteurs** : déplacer le potentiomètre et le curseur de lux dans Wokwi : `production` et `irradiance` suivent. Appuyer sur le bouton : `simulatedFault` passe à `true` et la production est divisée par 5 ; un second appui la rétablit.
8. **Arrêt brutal** : arrêter la simulation (Stop) ou tuer le tunnel : après environ 20 s (1,5 fois le maintien de 15 s), `solar/SITE01/status` passe à `{"v":1,"status":"offline"}`.
9. **Coupure réseau** : arrêter bore (Ctrl+C), attendre le message `MQTT : session perdue`, relancer bore. Si le port a changé, régénérer `secrets.h` et recompiler ; avec `bore local 8883 --to bore.pub --port <port>` le même port est redemandé et la simulation se reconnecte seule, `online` réapparaît.
10. **Vérification de format sur un message réel** : copier un message reçu à l'étape 6 et le passer à `SiteMeasurementSchema.parse(...)`.

Points à surveiller lors de ce test : l'étalonnage de la photorésistance et de l'ADC dans Wokwi (valeurs de `irradiance` attendues), le nom exact des broches du composant `board-esp32-devkit-c-v4` dans `diagram.json` (l'extension signale une broche inconnue au démarrage), et le temps de connexion TLS.
