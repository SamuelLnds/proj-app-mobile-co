// Programme de poste (pas pour l'ESP32) : produit, avec la même logique que le firmware
// (include/readings.h et include/messages.h), des messages représentatifs, un par ligne :
//   <genre> <ldrBrut> <potBrut> <panne> <epoch> <json>
// Le test tools/simulator/tests/firmware-format.test.ts le compile, l'exécute et valide chaque
// ligne avec les schémas Zod de @solar/contracts.
#include <cstdint>
#include <cstdio>

#include "messages.h"
#include "readings.h"

int main() {
  const int ldrRaw[] = {0, 1, 512, 1024, 2048, 3000, 3800, 4000, 4094, 4095};
  const int potRaw[] = {0, 1024, 2048, 4095};
  // 2025-11-20T10:15:05Z, 1970-01-01T00:00:00Z, un 29 février, une fin d'année, une date lointaine
  const int64_t epochs[] = {1763633705, 0, 1835395200, 1798761599, 4102444799};

  char buffer[MESSAGE_BUFFER_SIZE];
  for (int i = 0; i < 10; i++) {
    const int pot = potRaw[i % 4];
    const bool fault = (i % 3) == 0;
    const int64_t epoch = epochs[i % 5];

    SiteMeasurementData data = {};
    data.epochSeconds = epoch;
    data.irradiance = irradianceFromRaw(ldrRaw[i]);
    data.production = productionFromRaw(pot, fault);
    data.temperature = 20.0f + 5.0f * static_cast<float>(i);
    data.batteryLevel = FIXED_BATTERY_LEVEL_PCT;
    data.batteryPower = FIXED_BATTERY_POWER_W;
    data.gridPower = data.production;
    data.mode = FIXED_MODE;
    data.simulatedFault = fault;
    if (!formatSiteMeasurement(buffer, sizeof(buffer), data)) {
      std::fprintf(stderr, "mesure %d refusée\n", i);
      return 1;
    }
    std::printf("measurement %d %d %d %lld %s\n", ldrRaw[i], pot, fault ? 1 : 0,
                static_cast<long long>(epoch), buffer);
  }

  if (!formatDeviceStatus(buffer, sizeof(buffer), true, FIRMWARE_VERSION)) return 1;
  std::printf("status-online 0 0 0 0 %s\n", buffer);
  if (!formatDeviceStatus(buffer, sizeof(buffer), false, nullptr)) return 1;
  std::printf("status-offline 0 0 0 0 %s\n", buffer);

  // Une valeur hors bornes doit être refusée, pas publiée
  SiteMeasurementData invalid = {};
  invalid.mode = FIXED_MODE;
  invalid.irradiance = 2000.0f;
  std::printf("rejected-out-of-bounds 0 0 0 0 %s\n",
              formatSiteMeasurement(buffer, sizeof(buffer), invalid) ? "accepted" : "rejected");
  return 0;
}
