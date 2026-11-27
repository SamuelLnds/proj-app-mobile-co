// Programme de poste (pas pour l'ESP32) : exerce les fonctions de include/enrollment_text.h.
//   fingerprint <64 caractères hex>   empreinte recalculée à partir des octets, puis ses 4 lignes
//   request <nom>                     corps de la demande ; le CSR PEM est lu sur l'entrée standard
//   parse                             lit une réponse JSON de l'API sur l'entrée standard et affiche
//                                     status, puis certificate (entre deux marqueurs) et sa date
//   iso <date>                        date ISO 8601 UTC en secondes depuis 1970
// Le test tools/simulator/tests/firmware-enrollment.test.ts compare ces sorties au simulateur et aux
// schémas de @solar/contracts.
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "enrollment_text.h"

static char input[8192];

static void readInput() {
  const size_t length = std::fread(input, 1, sizeof(input) - 1, stdin);
  input[length] = '\0';
}

int main(int argc, char **argv) {
  if (argc < 2) return 2;
  const char *mode = argv[1];

  if (std::strcmp(mode, "fingerprint") == 0 && argc == 3) {
    uint8_t digest[32];
    for (int i = 0; i < 32; i++) {
      char byte[3] = {argv[2][2 * i], argv[2][2 * i + 1], '\0'};
      digest[i] = static_cast<uint8_t>(std::strtoul(byte, nullptr, 16));
    }
    char hex[FINGERPRINT_HEX_SIZE];
    fingerprintHex(digest, hex);
    std::printf("%s\n", hex);
    char line[FINGERPRINT_LINE_SIZE];
    for (int i = 0; i < FINGERPRINT_LINES; i++) {
      fingerprintLine(hex, i, line);
      std::printf("%s\n", line);
    }
    return 0;
  }

  if (std::strcmp(mode, "request") == 0 && argc == 3) {
    readInput();
    static char body[4096];
    if (!formatEnrollmentRequest(body, sizeof(body), argv[2], input)) {
      std::printf("too-long\n");
      return 0;
    }
    std::printf("%s\n", body);
    // Tampon trop petit : la fonction refuse au lieu de tronquer.
    char tiny[32];
    std::printf("%s\n", formatEnrollmentRequest(tiny, sizeof(tiny), argv[2], input) ? "truncated" : "refused");
    return 0;
  }

  if (std::strcmp(mode, "parse") == 0) {
    readInput();
    std::printf("%s\n", enrollmentStatusName(parseEnrollmentStatus(input)));
    static char certificate[4096];
    if (jsonStringField(input, "certificate", certificate, sizeof(certificate))) {
      std::printf("-----certificate-----\n%s-----end-----\n", certificate);
    } else {
      std::printf("no-certificate\n");
    }
    char expires[32];
    if (jsonStringField(input, "certificateExpiresAt", expires, sizeof(expires))) {
      std::printf("%lld\n", static_cast<long long>(parseIsoUtc(expires)));
    } else {
      std::printf("no-expiry\n");
    }
    return 0;
  }

  if (std::strcmp(mode, "iso") == 0 && argc == 3) {
    std::printf("%lld\n", static_cast<long long>(parseIsoUtc(argv[2])));
    return 0;
  }
  return 2;
}
