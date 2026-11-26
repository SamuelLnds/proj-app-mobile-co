// Construction des messages JSON de la section 6.2 de docs/conception/03-cartographie-technique.md.
// Fonctions pures, sans Arduino ni allocation : elles sont aussi compilées sur le poste par le test de
// format, qui passe leurs sorties au schéma Zod de @solar/contracts.
// Toute modification de format suit le skill mqtt-message (contrats, documentation, API, simulateur).
#pragma once

#include <cmath>
#include <cstdint>
#include <cstdio>

#include "config.h"
#include "pilot.h"

// Taille minimale du tampon d'une date ISO 8601 UTC (« 2026-11-20T10:15:05Z » et le zéro final).
constexpr size_t ISO_TIMESTAMP_SIZE = 21;
// Taille de tampon suffisante pour les messages produits ci-dessous.
constexpr size_t MESSAGE_BUFFER_SIZE = 320;

struct SiteMeasurementData {
  int64_t epochSeconds;
  float irradiance;
  float production;
  float temperature;
  float batteryLevel;
  float batteryPower;
  float gridPower;
  const char *mode;
  bool simulatedFault;
};

// Secondes depuis 1970 -> « AAAA-MM-JJThh:mm:ssZ » (calcul du calendrier grégorien, sans gmtime).
inline bool formatIsoTimestamp(int64_t epochSeconds, char *out, size_t size) {
  if (size < ISO_TIMESTAMP_SIZE || epochSeconds < 0) return false;
  int64_t days = epochSeconds / 86400;
  const int secondsOfDay = static_cast<int>(epochSeconds % 86400);
  // Jour -> date civile (algorithme de Howard Hinnant)
  days += 719468;
  const int64_t era = days / 146097;
  const int64_t dayOfEra = days - era * 146097;
  const int64_t yearOfEra = (dayOfEra - dayOfEra / 1460 + dayOfEra / 36524 - dayOfEra / 146096) / 365;
  const int64_t dayOfYear = dayOfEra - (365 * yearOfEra + yearOfEra / 4 - yearOfEra / 100);
  const int64_t monthIndex = (5 * dayOfYear + 2) / 153;
  const int day = static_cast<int>(dayOfYear - (153 * monthIndex + 2) / 5 + 1);
  const int month = static_cast<int>(monthIndex < 10 ? monthIndex + 3 : monthIndex - 9);
  const int year = static_cast<int>(yearOfEra + era * 400 + (month <= 2 ? 1 : 0));
  const int written = std::snprintf(out, size, "%04d-%02d-%02dT%02d:%02d:%02dZ", year, month, day,
                                    secondsOfDay / 3600, (secondsOfDay % 3600) / 60, secondsOfDay % 60);
  return written == static_cast<int>(ISO_TIMESTAMP_SIZE) - 1;
}

// Message SiteMeasurement. Renvoie false (et n'écrit rien d'exploitable) si une valeur sort des bornes
// du schéma : mieux vaut ne pas publier que publier un message que l'API ignorerait.
inline bool formatSiteMeasurement(char *out, size_t size, const SiteMeasurementData &data) {
  const float values[] = {data.irradiance, data.production,   data.temperature,
                          data.batteryLevel, data.batteryPower, data.gridPower};
  for (float value : values) {
    if (!std::isfinite(value)) return false;
  }
  if (data.irradiance < 0.0f || data.irradiance > 1500.0f) return false;
  if (data.production < 0.0f || data.gridPower < 0.0f) return false;
  if (data.temperature < -40.0f || data.temperature > 125.0f) return false;
  if (data.batteryLevel < 0.0f || data.batteryLevel > 100.0f) return false;
  if (data.mode == nullptr) return false;

  char timestamp[ISO_TIMESTAMP_SIZE];
  if (!formatIsoTimestamp(data.epochSeconds, timestamp, sizeof(timestamp))) return false;

  const int written = std::snprintf(
      out, size,
      "{\"v\":%d,\"timestamp\":\"%s\",\"irradiance\":%.1f,\"production\":%.1f,\"temperature\":%.1f,"
      "\"batteryLevel\":%.1f,\"batteryPower\":%.1f,\"gridPower\":%.1f,\"mode\":\"%s\","
      "\"simulatedFault\":%s}",
      MESSAGE_VERSION, timestamp, data.irradiance, data.production, data.temperature, data.batteryLevel,
      data.batteryPower, data.gridPower, data.mode, data.simulatedFault ? "true" : "false");
  return written > 0 && static_cast<size_t>(written) < size;
}

// Message DeviceStatus : `online` porte la version du firmware, `offline` n'en porte pas.
inline bool formatDeviceStatus(char *out, size_t size, bool online, const char *firmwareVersion) {
  const int written =
      online ? std::snprintf(out, size, "{\"v\":%d,\"status\":\"online\",\"firmwareVersion\":\"%s\"}",
                             MESSAGE_VERSION, firmwareVersion)
             : std::snprintf(out, size, "{\"v\":%d,\"status\":\"offline\"}", MESSAGE_VERSION);
  return written > 0 && static_cast<size_t>(written) < size;
}

// Message ControlState : état appliqué, publié en retained. Renvoie false si une valeur sort du schéma
// (identifiant qui n'est pas un UUID, part hors de 0 à 100, raison absente pour un statut partial ou
// rejected) : mieux vaut ne pas publier que publier un message que l'API ignorerait.
inline bool formatControlState(char *out, size_t size, int64_t epochSeconds, const StateToPublish &state) {
  const bool hasId = state.setpointId[0] != '\0';
  if (hasId && !isUuid(state.setpointId)) return false;
  if (state.appliedShare != NO_SHARE && (state.appliedShare < 0 || state.appliedShare > 100)) return false;
  const char *reason = reasonName(state.reason);
  if (state.status != ControlStatus::Applied && reason == nullptr) return false;

  char timestamp[ISO_TIMESTAMP_SIZE];
  if (!formatIsoTimestamp(epochSeconds, timestamp, sizeof(timestamp))) return false;

  char id[UUID_LENGTH + 3] = "null";
  if (hasId) std::snprintf(id, sizeof(id), "\"%s\"", state.setpointId);
  char share[8] = "null";
  if (state.appliedShare != NO_SHARE) std::snprintf(share, sizeof(share), "%d", state.appliedShare);
  char reasonJson[24] = "null";
  if (reason != nullptr) std::snprintf(reasonJson, sizeof(reasonJson), "\"%s\"", reason);

  const int written = std::snprintf(
      out, size,
      "{\"v\":%d,\"setpointId\":%s,\"mode\":\"%s\",\"status\":\"%s\",\"appliedBatteryShare\":%s,"
      "\"reason\":%s,\"timestamp\":\"%s\"}",
      MESSAGE_VERSION, id, modeName(state.mode), statusName(state.status), share, reasonJson, timestamp);
  return written > 0 && static_cast<size_t>(written) < size;
}
