// Objet du site : mesures publiées en MQTT toutes les SITE_MEASUREMENT_PERIOD_S secondes.
// Batterie et flux : valeurs fixes en attendant la batterie simulée (#38) et le pilotage (#39).
#include <Arduino.h>

#include "config.h"
#include "messages.h"
#include "network.h"
#include "readings.h"
#include "sensors.h"

namespace {

unsigned long lastMeasurementMs = 0;
bool measuredOnce = false;

void publishMeasurement() {
  float temperature = 0.0f;
  if (!sensors::readTemperature(temperature)) {
    Serial.println("DS18B20 : sonde absente, mesure non publiée");
    return;
  }

  const float production = sensors::readProduction();
  SiteMeasurementData data = {};
  data.epochSeconds = network::epochSeconds();
  data.irradiance = sensors::readIrradiance();
  data.production = production;
  data.temperature = temperature;
  data.batteryLevel = FIXED_BATTERY_LEVEL_PCT;
  data.batteryPower = FIXED_BATTERY_POWER_W;
  data.gridPower = production;  // sans batterie, toute la production part sur le réseau
  data.mode = FIXED_MODE;
  data.simulatedFault = sensors::simulatedFault();

  // Valeurs lisibles des capteurs, pour les régler dans Wokwi sans lire le JSON publié.
  const float potPercent = clampFloat(
      data.production * (data.simulatedFault ? FAULT_PRODUCTION_DIVISOR : 1.0f) / DEMO_SITE_PEAK_POWER_W * 100.0f,
      0.0f, 100.0f);
  Serial.printf("Capteurs : lumière %.0f W/m² | potentiomètre %.0f %% -> production %.0f W%s | température %.1f °C\n",
                data.irradiance, potPercent, data.production, data.simulatedFault ? " (panne ÷5)" : "",
                data.temperature);

  char payload[MESSAGE_BUFFER_SIZE];
  if (!formatSiteMeasurement(payload, sizeof(payload), data)) {
    Serial.println("Mesure hors bornes, non publiée");
    return;
  }
  sensors::applyOutputs(data.batteryLevel, data.batteryPower, data.gridPower);
  if (network::publish("measurements", payload, false)) {
    Serial.printf("Mesure : %s\n", payload);
  } else {
    Serial.println("Mesure : échec de la publication");
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.printf("Parc solaire - objet du site %s, firmware %s\n", SITE_CODE, FIRMWARE_VERSION);
  sensors::begin();
  network::begin();
}

void loop() {
  network::loop();
  sensors::pollFaultButton();

  const unsigned long now = millis();
  const bool due = !measuredOnce || now - lastMeasurementMs >= SITE_MEASUREMENT_PERIOD_S * 1000UL;
  if (due && network::isMqttConnected() && network::epochSeconds() > 0) {
    measuredOnce = true;
    lastMeasurementMs = now;
    publishMeasurement();
  }
}
