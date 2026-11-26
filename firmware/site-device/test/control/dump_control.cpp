// Programme de poste (pas pour l'ESP32) : exécute, avec la même logique que le firmware
// (include/control.h, setpoint.h, pilot.h et messages.h), l'algorithme de pilotage et affiche ses résultats.
// Le test tools/simulator/tests/firmware-control.test.ts le compile, l'exécute et compare ces résultats
// à l'implémentation de référence du simulateur Node (applyControl, nextBatteryLevel), puis valide
// chaque `ControlState` avec les schémas Zod de @solar/contracts.
//
// Usage : dump_control grid | battery | scenarios
//   grid       <mode> <part> <production> <niveau> <pmax> <puissanceBatterie> <puissanceRéseau> <partAppliquée> <statut> <raison>
//   battery    <niveau> <puissance> <secondes> <capacité> <niveauSuivant>
//   scenarios  lignes « <genre> <étiquette> <valeur> »
#include <cstdint>
#include <cstdlib>
#include <cstdio>
#include <cstring>

#include "control.h"
#include "messages.h"
#include "pilot.h"
#include "setpoint.h"

namespace {

constexpr int64_t EPOCH = 1763633705;  // 2025-11-20T10:15:05Z
const char *SETPOINT_ID = "0b8f3c1e-5d1a-4a53-9a0e-2f4b7c9d1e22";
const char *OTHER_ID = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";

const ControlMode MODES[] = {ControlMode::Manual, ControlMode::Automatic, ControlMode::Discharge};

const char *reasonText(RejectionReason reason) {
  const char *name = reasonName(reason);
  return name != nullptr ? name : "none";
}

void printGrid() {
  // Parts valides et invalides (hors pas, hors bornes, absente)
  const int shares[] = {NO_SHARE, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 5, 15, 110, -10, 101};
  const double levels[] = {0.0, 10.0, 19.9, 20.0, 20.1, 50.0, 79.9, 80.0, 90.0, 94.9, 95.0, 99.9, 100.0};
  const double productions[] = {0.0, 1.0, 500.0, 1000.0, 1999.9, 3000.0, 3333.3, 3999.9, 4000.0};
  const double maxPowers[] = {3000.0, 1000.0, 5000.0, 0.0};
  for (ControlMode mode : MODES) {
    for (int share : shares) {
      for (double level : levels) {
        for (double production : productions) {
          for (double pmax : maxPowers) {
            const ControlOutput out = applyControl({mode, share, production, level, pmax});
            std::printf("%s %d %.17g %.17g %.17g %.17g %.17g %d %s %s\n", modeName(mode), share, production, level,
                        pmax, out.batteryPower, out.gridPower, out.appliedShare, statusName(out.status),
                        reasonText(out.reason));
          }
        }
      }
    }
  }
}

void printBattery() {
  const double levels[] = {0.0, 0.1, 19.9, 20.0, 50.0, 94.9, 99.9, 100.0};
  const double powers[] = {-3000.0, -1234.5, 0.0, 1500.0, 3000.0};
  const double durations[] = {0.5, 1.0, 5.0, 10.0};
  for (double level : levels) {
    for (double power : powers) {
      for (double seconds : durations) {
        const double next = nextBatteryLevel(level, power, seconds, DEMO_SITE_BATTERY_CAPACITY_WH);
        std::printf("%.17g %.17g %.17g %d %.17g\n", level, power, seconds, DEMO_SITE_BATTERY_CAPACITY_WH, next);
      }
    }
  }
}

// Affiche l'état en vigueur sous forme de message ControlState.
void emit(const char *kind, const char *label, const StateToPublish &state) {
  char json[MESSAGE_BUFFER_SIZE];
  if (!formatControlState(json, sizeof(json), EPOCH, state)) {
    std::fprintf(stderr, "état %s refusé\n", label);
    std::exit(1);
  }
  std::printf("%s %s %s\n", kind, label, json);
}

// Construit un Setpoint JSON, le lit avec l'analyseur du firmware, et renvoie le verdict.
ParsedSetpoint makeSetpoint(const char *id, const char *mode, const char *share) {
  char json[256];
  std::snprintf(json, sizeof(json),
                "{\"v\":1,\"id\":\"%s\",\"mode\":\"%s\",\"batteryShare\":%s,\"issuedAt\":\"2026-11-20T10:16:00Z\"}", id,
                mode, share);
  return parseSetpoint(json, std::strlen(json));
}

// Ligne du tableau « statut renvoyé » : une consigne reçue sur un objet neuf, premier état publié.
void tableRow(const char *label, double level, double production, const char *mode, const char *share) {
  Pilot pilot(level);
  pilot.recompute(production);
  const ParsedSetpoint setpoint = makeSetpoint(SETPOINT_ID, mode, share);
  StateToPublish state;
  if (setpoint.verdict == SetpointVerdict::Valid) {
    if (!pilot.receiveSetpoint(setpoint, production)) std::exit(2);
    state = pilot.state();
  } else if (setpoint.verdict != SetpointVerdict::Invalid || !pilot.rejectSetpoint(setpoint, state)) {
    std::exit(3);
  }
  emit("row", label, state);
}

// Charge de 20 % jusqu'à la première publication après le démarrage : renvoie le nombre de ticks d'une seconde.
int chargeUntilPublished(Pilot &pilot, double production, const char *label) {
  int ticks = 0;
  while (ticks < 100000) {
    ticks++;
    if (pilot.tick(1.0, production)) {
      emit("state", label, pilot.state());
      return ticks;
    }
  }
  return -1;
}

void printScenarios() {
  tableRow("invalid-setpoint", 50, 2000, "manual", "15");
  tableRow("applied-manual", 50, 2000, "manual", "50");
  tableRow("applied-automatic", 50, 2000, "automatic", "null");
  tableRow("partial-charge-limit", 50, 4000, "manual", "100");
  tableRow("rejected-battery-full", 95, 2000, "manual", "50");
  tableRow("rejected-battery-low", 20, 2000, "discharge", "null");
  tableRow("applied-discharge", 21, 2000, "discharge", "null");
  tableRow("applied-night", 50, 0, "manual", "100");

  // Objet qui démarre : état initial sans consigne, publié une fois.
  {
    Pilot pilot;
    pilot.recompute(2000.0);
    std::printf("note boot-pending %d\n", pilot.publishPending() ? 1 : 0);
    emit("state", "boot", pilot.state());
    pilot.markPublished();
    std::printf("note boot-after-publish %d\n", pilot.publishPending() ? 1 : 0);
  }

  // Charge de 20 % à 95 % avec 3 000 W vers la batterie : durée réelle et état publié à la fin.
  {
    Pilot pilot(20.0);
    pilot.recompute(3000.0);
    pilot.receiveSetpoint(makeSetpoint(SETPOINT_ID, "manual", "100"), 3000.0);
    pilot.markPublished();
    const int ticks = chargeUntilPublished(pilot, 3000.0, "charge-end");
    std::printf("note charge-ticks %d\n", ticks);
    std::printf("note charge-level %.17g\n", pilot.level());
  }

  // Automatique : la charge s'arrête à 80 %, ce qui change la part appliquée (100 -> 0) et publie un état.
  {
    Pilot pilot(79.0);
    pilot.recompute(3000.0);
    pilot.receiveSetpoint(makeSetpoint(SETPOINT_ID, "automatic", "null"), 3000.0);
    pilot.markPublished();
    const int ticks = chargeUntilPublished(pilot, 3000.0, "automatic-target");
    std::printf("note automatic-ticks %d\n", ticks);
  }

  // Sans changement de part, de statut ni de raison, aucun état n'est à publier.
  {
    Pilot pilot(50.0);
    pilot.recompute(2000.0);
    pilot.receiveSetpoint(makeSetpoint(SETPOINT_ID, "manual", "50"), 2000.0);
    pilot.markPublished();
    int pending = 0;
    for (int i = 0; i < 30; i++) pending += pilot.tick(1.0, 2000.0 + 10.0 * i) ? 1 : 0;
    std::printf("note steady-pending %d\n", pending);
  }

  // Reconnexion : le broker renvoie la consigne retained, déjà appliquée -> rien à republier.
  {
    Pilot pilot(50.0);
    pilot.recompute(2000.0);
    const ParsedSetpoint setpoint = makeSetpoint(SETPOINT_ID, "manual", "70");
    const bool first = pilot.receiveSetpoint(setpoint, 2000.0);
    pilot.markPublished();
    const bool second = pilot.receiveSetpoint(setpoint, 2000.0);
    std::printf("note redelivery %d %d %d\n", first ? 1 : 0, second ? 1 : 0, pilot.publishPending() ? 1 : 0);
    // Une consigne différente, même au contenu proche, est bien nouvelle.
    const bool third = pilot.receiveSetpoint(makeSetpoint(OTHER_ID, "manual", "70"), 2000.0);
    std::printf("note redelivery-new-id %d\n", third ? 1 : 0);
  }

  // Consigne invalide : refusée une fois, la consigne en vigueur continue de s'appliquer.
  {
    Pilot pilot(50.0);
    pilot.recompute(2000.0);
    pilot.receiveSetpoint(makeSetpoint(SETPOINT_ID, "manual", "70"), 2000.0);
    pilot.markPublished();
    const ParsedSetpoint bad = makeSetpoint(OTHER_ID, "manual", "15");
    StateToPublish rejection;
    const bool first = pilot.rejectSetpoint(bad, rejection);
    emit("state", "rejection", rejection);
    const bool second = pilot.rejectSetpoint(bad, rejection);
    std::printf("note rejection-twice %d %d\n", first ? 1 : 0, second ? 1 : 0);
    std::printf("note rejection-in-force-share %d\n", pilot.output().appliedShare);
    pilot.tick(1.0, 2000.0);
    std::printf("note rejection-republish %d\n", pilot.publishPending() ? 1 : 0);
    emit("state", "after-rejection", pilot.state());
  }
}

}  // namespace

int main(int argc, char **argv) {
  const char *command = argc > 1 ? argv[1] : "";
  if (std::strcmp(command, "grid") == 0) printGrid();
  else if (std::strcmp(command, "battery") == 0) printBattery();
  else if (std::strcmp(command, "scenarios") == 0) printScenarios();
  else {
    std::fprintf(stderr, "usage : dump_control grid|battery|scenarios\n");
    return 1;
  }
  return 0;
}
