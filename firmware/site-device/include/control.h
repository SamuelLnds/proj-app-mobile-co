// Algorithme de pilotage de l'objet (section 7 de docs/conception/02-uml.md), en fonctions pures.
// Aucune entrée-sortie ni Arduino : le fichier est aussi compilé sur le poste par les tests, qui le
// comparent à l'implémentation de référence du simulateur (tools/simulator/src/device/control.ts).
// Les calculs sont faits en double, comme en TypeScript, pour que les résultats soient identiques.
#pragma once

#include <cmath>
#include <cstring>

#include "config.h"

enum class ControlMode { Manual, Automatic, Discharge };
enum class ControlStatus { Applied, Partial, Rejected };
enum class RejectionReason { None, BatteryFull, BatteryLow, ChargeLimit, InvalidSetpoint };

// Valeur de `batteryShare` ou de `appliedBatteryShare` quand le JSON porte `null`.
constexpr int NO_SHARE = -1;

inline const char *modeName(ControlMode mode) {
  switch (mode) {
    case ControlMode::Manual: return "manual";
    case ControlMode::Automatic: return "automatic";
    case ControlMode::Discharge: return "discharge";
  }
  return "automatic";
}

inline const char *statusName(ControlStatus status) {
  switch (status) {
    case ControlStatus::Applied: return "applied";
    case ControlStatus::Partial: return "partial";
    case ControlStatus::Rejected: return "rejected";
  }
  return "rejected";
}

// Raison de refus ou de limitation ; nullptr quand il n'y en a pas (JSON `null`).
inline const char *reasonName(RejectionReason reason) {
  switch (reason) {
    case RejectionReason::None: return nullptr;
    case RejectionReason::BatteryFull: return "battery_full";
    case RejectionReason::BatteryLow: return "battery_low";
    case RejectionReason::ChargeLimit: return "charge_limit";
    case RejectionReason::InvalidSetpoint: return "invalid_setpoint";
  }
  return nullptr;
}

// Lit un nom de mode du JSON ; false s'il est inconnu.
inline bool parseMode(const char *text, ControlMode &out) {
  if (std::strcmp(text, "manual") == 0) out = ControlMode::Manual;
  else if (std::strcmp(text, "automatic") == 0) out = ControlMode::Automatic;
  else if (std::strcmp(text, "discharge") == 0) out = ControlMode::Discharge;
  else return false;
  return true;
}

struct ControlInput {
  ControlMode mode;
  int requestedShare;       // part demandée (mode manuel), en % ; NO_SHARE hors du mode manuel
  double production;        // production du site (W)
  double level;             // niveau de la batterie (%)
  double maxChargePowerW;   // puissance de charge maximale (W)
};

struct ControlOutput {
  double batteryPower;  // positif = charge, négatif = décharge (W)
  double gridPower;     // puissance injectée sur le réseau (W)
  int appliedShare;     // part effectivement appliquée ; NO_SHARE en restitution ou si la consigne est invalide
  ControlStatus status;
  RejectionReason reason;
};

// Une part valide est un entier de 0 à 100, multiple du pas de la charte.
inline bool isValidShare(int share) {
  return share >= 0 && share <= 100 && share % BATTERY_SHARE_STEP_PCT == 0;
}

// Calcule les flux et le statut pour un tick, selon le mode en vigueur.
inline ControlOutput applyControl(const ControlInput &input) {
  const double p = input.production;
  const double pmax = input.maxChargePowerW;

  if (input.mode == ControlMode::Discharge) {
    if (input.level > BATTERY_LOW_PCT) {
      return {-pmax, p + pmax, NO_SHARE, ControlStatus::Applied, RejectionReason::None};
    }
    return {0.0, p, NO_SHARE, ControlStatus::Rejected, RejectionReason::BatteryLow};
  }

  if (input.mode == ControlMode::Manual && !isValidShare(input.requestedShare)) {
    return {0.0, p, NO_SHARE, ControlStatus::Rejected, RejectionReason::InvalidSetpoint};
  }

  const int share = input.mode == ControlMode::Automatic
                        ? (input.level < AUTOMATIC_CHARGE_TARGET_PCT ? 100 : 0)
                        : input.requestedShare;

  if (share > 0 && input.level >= BATTERY_FULL_PCT) {
    return {0.0, p, 0, ControlStatus::Rejected, RejectionReason::BatteryFull};
  }

  const double wanted = (p * share) / 100.0;
  if (wanted > pmax) {
    // Ici p > 0 (car wanted > pmax > 0) : la division est sûre.
    // floor(x + 0,5) reproduit Math.round de JavaScript (arrondi vers le haut à .5).
    const int effectiveShare = static_cast<int>(std::floor((pmax / p) * 100.0 + 0.5));
    // En automatique, la limite de charge fait partie de la règle : la demande est respectée.
    if (input.mode == ControlMode::Manual) {
      return {pmax, p - pmax, effectiveShare, ControlStatus::Partial, RejectionReason::ChargeLimit};
    }
    return {pmax, p - pmax, share, ControlStatus::Applied, RejectionReason::None};
  }

  return {wanted, p - wanted, share, ControlStatus::Applied, RejectionReason::None};
}

// Nouveau niveau de batterie (%) après `seconds` secondes réelles, en temps accéléré, borné à 0-100.
inline double nextBatteryLevel(double level, double batteryPower, double seconds, double capacityWh) {
  const double wh = (batteryPower * seconds * BATTERY_TIME_FACTOR) / 3600.0;
  const double next = level + (wh / capacityWh) * 100.0;
  return next < 0.0 ? 0.0 : (next > 100.0 ? 100.0 : next);
}
