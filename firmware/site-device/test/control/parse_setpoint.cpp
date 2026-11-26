// Programme de poste (pas pour l'ESP32) : lit des messages `Setpoint`, un par ligne sur l'entrée standard,
// avec l'analyseur du firmware (include/setpoint.h), et affiche le verdict de chacun :
//   valid <id> <mode> <part>   (part : -1 pour null)
//   invalid <id>
//   unreadable
// Le test tools/simulator/tests/firmware-control.test.ts compare ces verdicts à ceux du schéma Zod
// `SetpointSchema` de @solar/contracts.
#include <cstdio>
#include <cstring>

#include "setpoint.h"

int main() {
  static char line[2048];
  while (std::fgets(line, sizeof(line), stdin) != nullptr) {
    size_t length = std::strlen(line);
    while (length > 0 && (line[length - 1] == '\n' || line[length - 1] == '\r')) length--;
    const ParsedSetpoint parsed = parseSetpoint(line, length);
    switch (parsed.verdict) {
      case SetpointVerdict::Valid:
        std::printf("valid %s %s %d\n", parsed.id, modeName(parsed.mode), parsed.batteryShare);
        break;
      case SetpointVerdict::Invalid:
        std::printf("invalid %s\n", parsed.id);
        break;
      case SetpointVerdict::Unreadable:
        std::printf("unreadable\n");
        break;
    }
  }
  return 0;
}
