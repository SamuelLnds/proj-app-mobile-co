// Conversion des lectures brutes des capteurs en grandeurs physiques.
// Fonctions pures, sans Arduino : elles sont aussi compilées sur le poste par le test de format.
#pragma once

#include <cmath>

#include "config.h"

inline float clampFloat(float value, float low, float high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

// Photorésistance : la tension de AO monte quand il fait sombre (LDR en série avec 10 kΩ côté VCC).
// On remonte à la résistance du LDR, puis à l'éclairement (loi du module Wokwi), puis à des W/m².
inline float irradianceFromRaw(int raw) {
  const float volts = clampFloat(static_cast<float>(raw), 0.0f, ADC_MAX_RAW) / ADC_MAX_RAW * ADC_REFERENCE_V;
  if (volts >= ADC_REFERENCE_V - 0.001f) return 0.0f;  // résistance quasi infinie : obscurité
  if (volts <= 0.001f) return IRRADIANCE_MAX_W_M2;     // résistance quasi nulle : éblouissement
  const float ldrOhm = LDR_SERIES_OHM * volts / (ADC_REFERENCE_V - volts);
  const float lux = std::pow(LDR_RL10_OHM * std::pow(10.0f, LDR_GAMMA) / ldrOhm, 1.0f / LDR_GAMMA);
  if (!std::isfinite(lux)) return IRRADIANCE_MAX_W_M2;
  return clampFloat(lux / LUX_PER_W_M2, 0.0f, IRRADIANCE_MAX_W_M2);
}

// Potentiomètre : 0 à la puissance crête du site de démonstration ; la panne divise la production.
inline float productionFromRaw(int raw, bool simulatedFault) {
  const float ratio = clampFloat(static_cast<float>(raw), 0.0f, ADC_MAX_RAW) / ADC_MAX_RAW;
  const float watts = ratio * static_cast<float>(DEMO_SITE_PEAK_POWER_W);
  return simulatedFault ? watts / FAULT_PRODUCTION_DIVISOR : watts;
}
