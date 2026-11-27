// Textes de l'enrôlement (D027, #83) : corps de la demande, lecture des réponses de l'API et format de
// l'empreinte. Fonctions pures, sans Arduino ni allocation : elles sont aussi compilées sur le poste, où
// un test (tools/simulator/tests/firmware-enrollment.test.ts) compare leurs sorties au simulateur et aux
// schémas de @solar/contracts. Même principe que l'analyseur des consignes (D032).
#pragma once

#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>

// Empreinte SHA-256 en hexadécimal minuscule (64 caractères et le zéro final).
constexpr size_t FINGERPRINT_HEX_SIZE = 65;
// Une ligne de l'empreinte : 4 groupes de 4 caractères séparés par une espace (19 caractères et le zéro).
constexpr size_t FINGERPRINT_LINE_SIZE = 20;
constexpr int FINGERPRINT_LINES = 4;

// États d'une demande, comme `enrollment_status` (section 3 de docs/conception/01-modele-donnees.md).
enum class EnrollmentStatus { Pending, Active, Rejected, Revoked, Expired, Unknown };

inline void fingerprintHex(const uint8_t digest[32], char out[FINGERPRINT_HEX_SIZE]) {
  static const char HEX_DIGITS[] = "0123456789abcdef";
  for (int i = 0; i < 32; i++) {
    out[2 * i] = HEX_DIGITS[digest[i] >> 4];
    out[2 * i + 1] = HEX_DIGITS[digest[i] & 0x0f];
  }
  out[64] = '\0';
}

// Ligne `index` (0 à 3) de l'empreinte, comme dans l'app : « 3fa9 4c0e 7b21 d85a ».
inline void fingerprintLine(const char *hex, int index, char out[FINGERPRINT_LINE_SIZE]) {
  size_t length = 0;
  for (int group = 0; group < 4; group++) {
    if (group > 0) out[length++] = ' ';
    std::memcpy(out + length, hex + index * 16 + group * 4, 4);
    length += 4;
  }
  out[length] = '\0';
}

// Corps de `POST /v1/enrollments` : {"deviceName":"…","csr":"…"}, avec les fins de ligne du PEM
// échappées. Renvoie false si le tampon est trop petit.
inline bool formatEnrollmentRequest(char *out, size_t size, const char *deviceName, const char *csrPem) {
  size_t length = 0;
  auto put = [&](char c) {
    if (length + 1 >= size) return false;
    out[length++] = c;
    return true;
  };
  auto putText = [&](const char *text) {
    for (const char *p = text; *p != '\0'; p++) {
      if (!put(*p)) return false;
    }
    return true;
  };
  if (!putText("{\"deviceName\":\"") || !putText(deviceName) || !putText("\",\"csr\":\"")) return false;
  for (const char *p = csrPem; *p != '\0'; p++) {
    bool ok = true;
    switch (*p) {
      case '\n': ok = put('\\') && put('n'); break;
      case '\r': break;
      case '"': ok = put('\\') && put('"'); break;
      case '\\': ok = put('\\') && put('\\'); break;
      default: ok = put(*p); break;
    }
    if (!ok) return false;
  }
  if (!putText("\"}")) return false;
  out[length] = '\0';
  return true;
}

// Valeur texte du champ `key` d'un objet JSON plat produit par l'API (JSON.stringify), séquences
// d'échappement décodées (\n, \", \\, \/). Renvoie false si le champ est absent, vaut `null`, n'est pas
// un texte ou ne tient pas dans le tampon.
inline bool jsonStringField(const char *json, const char *key, char *out, size_t size) {
  char pattern[48];
  const int written = std::snprintf(pattern, sizeof(pattern), "\"%s\":", key);
  if (written <= 0 || static_cast<size_t>(written) >= sizeof(pattern)) return false;
  const char *p = std::strstr(json, pattern);
  if (p == nullptr) return false;
  p += written;
  while (*p == ' ') p++;
  if (*p != '"') return false;
  p++;
  size_t length = 0;
  for (; *p != '\0' && *p != '"'; p++) {
    char c = *p;
    if (c == '\\') {
      p++;
      switch (*p) {
        case 'n': c = '\n'; break;
        case 'r': c = '\r'; break;
        case 't': c = '\t'; break;
        case '"': c = '"'; break;
        case '\\': c = '\\'; break;
        case '/': c = '/'; break;
        default: return false;  // \u et autres : absents des réponses attendues
      }
    }
    if (length + 1 >= size) return false;
    out[length++] = c;
  }
  if (*p != '"') return false;
  out[length] = '\0';
  return true;
}

inline EnrollmentStatus parseEnrollmentStatus(const char *json) {
  char status[16];
  if (!jsonStringField(json, "status", status, sizeof(status))) return EnrollmentStatus::Unknown;
  if (std::strcmp(status, "pending") == 0) return EnrollmentStatus::Pending;
  if (std::strcmp(status, "active") == 0) return EnrollmentStatus::Active;
  if (std::strcmp(status, "rejected") == 0) return EnrollmentStatus::Rejected;
  if (std::strcmp(status, "revoked") == 0) return EnrollmentStatus::Revoked;
  if (std::strcmp(status, "expired") == 0) return EnrollmentStatus::Expired;
  return EnrollmentStatus::Unknown;
}

inline const char *enrollmentStatusName(EnrollmentStatus status) {
  switch (status) {
    case EnrollmentStatus::Pending: return "pending";
    case EnrollmentStatus::Active: return "active";
    case EnrollmentStatus::Rejected: return "rejected";
    case EnrollmentStatus::Revoked: return "revoked";
    case EnrollmentStatus::Expired: return "expired";
    case EnrollmentStatus::Unknown: break;
  }
  return "unknown";
}

// Date ISO 8601 UTC de l'API (« 2026-11-27T18:05:00.000Z ») en secondes depuis 1970 ; 0 si illisible.
inline int64_t parseIsoUtc(const char *text) {
  int year, month, day, hour, minute, second;
  if (std::sscanf(text, "%4d-%2d-%2dT%2d:%2d:%2d", &year, &month, &day, &hour, &minute, &second) != 6) return 0;
  // Jours depuis 1970 (algorithme des jours civils, H. Hinnant).
  year -= month <= 2 ? 1 : 0;
  const int era = (year >= 0 ? year : year - 399) / 400;
  const unsigned yoe = static_cast<unsigned>(year - era * 400);
  const unsigned doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + static_cast<unsigned>(day) - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  const int64_t days = static_cast<int64_t>(era) * 146097 + static_cast<int64_t>(doe) - 719468;
  return days * 86400 + hour * 3600 + minute * 60 + second;
}
