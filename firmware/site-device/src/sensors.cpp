#include "sensors.h"

#include <Arduino.h>
#include <DallasTemperature.h>
#include <OneWire.h>

#include "config.h"
#include "pins.h"
#include "readings.h"

namespace {

constexpr int ADC_SAMPLES = 16;

OneWire oneWire(PIN_ONE_WIRE);
DallasTemperature temperatureSensor(&oneWire);

bool faultActive = false;
bool lastButtonLevel = HIGH;    // dernière lecture brute
bool stableButtonLevel = HIGH;  // niveau stable après anti-rebond
unsigned long lastButtonChangeMs = 0;

// Moyenne de plusieurs lectures pour lisser le bruit de l'ADC.
int readAveragedRaw(int pin) {
  long sum = 0;
  for (int i = 0; i < ADC_SAMPLES; i++) sum += analogRead(pin);
  return static_cast<int>(sum / ADC_SAMPLES);
}

}  // namespace

namespace sensors {

void begin() {
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  pinMode(PIN_FAULT_BUTTON, INPUT_PULLUP);
  pinMode(PIN_RELAY_BATTERY, OUTPUT);
  pinMode(PIN_RELAY_GRID, OUTPUT);
  digitalWrite(PIN_RELAY_BATTERY, LOW);
  digitalWrite(PIN_RELAY_GRID, LOW);
  for (int pin : LED_BAR_PINS) {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, LOW);
  }

  temperatureSensor.begin();
  temperatureSensor.setResolution(10);  // conversion en 190 ms, résolution de 0,25 °C
}

void pollFaultButton() {
  const bool level = digitalRead(PIN_FAULT_BUTTON);
  const unsigned long now = millis();
  if (level != lastButtonLevel) {
    lastButtonLevel = level;
    lastButtonChangeMs = now;
  }
  if (now - lastButtonChangeMs >= BUTTON_DEBOUNCE_MS && level != stableButtonLevel) {
    stableButtonLevel = level;
    if (level == LOW) {  // appui : bascule la panne
      faultActive = !faultActive;
      Serial.printf("Bouton : panne simulée %s\n", faultActive ? "activée" : "désactivée");
    }
  }
}

bool simulatedFault() { return faultActive; }

float readIrradiance() { return irradianceFromRaw(readAveragedRaw(PIN_LDR)); }

float readProduction() { return productionFromRaw(readAveragedRaw(PIN_POT), faultActive); }

bool readTemperature(float &celsius) {
  temperatureSensor.requestTemperatures();
  const float value = temperatureSensor.getTempCByIndex(0);
  if (value == DEVICE_DISCONNECTED_C) return false;
  celsius = value;
  return true;
}

void applyOutputs(float batteryLevelPct, float batteryPowerW, float gridPowerW) {
  digitalWrite(PIN_RELAY_BATTERY, batteryPowerW > 0.0f ? HIGH : LOW);
  digitalWrite(PIN_RELAY_GRID, gridPowerW > 0.0f ? HIGH : LOW);
  // Une LED par tranche de 10 % de batterie
  const int lit = static_cast<int>(clampFloat(batteryLevelPct, 0.0f, 100.0f) / 10.0f + 0.5f);
  for (int i = 0; i < 10; i++) digitalWrite(LED_BAR_PINS[i], i < lit ? HIGH : LOW);
}

}  // namespace sensors
