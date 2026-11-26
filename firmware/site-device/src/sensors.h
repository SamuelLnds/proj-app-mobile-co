// Capteurs, bouton de panne et sorties (relais, barre de LED) de l'objet.
#pragma once

namespace sensors {

void begin();

// À appeler à chaque tour de loop() : lit le bouton de panne (anti-rebond) et bascule `simulatedFault`.
void pollFaultButton();

bool simulatedFault();

// Ensoleillement (W/m²) d'après la photorésistance.
float readIrradiance();

// Production (W) d'après le potentiomètre, divisée par 5 quand la panne est active.
float readProduction();

// Température (°C) du DS18B20 ; false si la sonde ne répond pas.
bool readTemperature(float &celsius);

// Relais 1 : charge de la batterie, relais 2 : injection réseau, barre de LED : niveau de batterie.
void applyOutputs(float batteryLevelPct, float batteryPowerW, float gridPowerW);

}  // namespace sensors
