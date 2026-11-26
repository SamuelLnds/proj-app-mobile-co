// Broches de l'ESP32 (tableau détaillé dans firmware/site-device/README.md ; câblage dans diagram.json).
// Les entrées analogiques sont sur l'ADC1 : l'ADC2 est inutilisable quand le WiFi est actif.
#pragma once

constexpr int PIN_LDR = 34;           // Photorésistance, sortie analogique AO
constexpr int PIN_POT = 35;           // Potentiomètre, sortie SIG
constexpr int PIN_ONE_WIRE = 4;       // DS18B20, ligne DQ (résistance de rappel de 4,7 kΩ vers 3V3)
constexpr int PIN_RELAY_BATTERY = 26; // Relais 1 : charge de la batterie
constexpr int PIN_RELAY_GRID = 27;    // Relais 2 : injection sur le réseau
constexpr int PIN_FAULT_BUTTON = 13;  // Bouton de panne, l'autre borne à GND (entrée avec rappel interne)

// Barre de LED : A1 (haut) à A10, la première LED allumée correspond aux 10 premiers % de batterie.
constexpr int LED_BAR_PINS[10] = {16, 17, 18, 19, 21, 22, 23, 25, 32, 33};
