// Modèle de pilotage de l'objet : consigne en vigueur, batterie, flux et état à publier.
// Même rôle que `SiteDevice` dans tools/simulator/src/device/site-device.ts. Aucune entrée-sortie ni
// horloge : le temps et la production sont fournis par l'appelant, et le fichier est aussi compilé sur
// le poste par les tests.
#pragma once

#include <cstring>

#include "control.h"
#include "setpoint.h"

// Ce qui, dans l'état appliqué, déclenche une nouvelle publication quand cela change.
struct StateSignature {
  ControlStatus status;
  int appliedShare;
  RejectionReason reason;

  bool operator==(const StateSignature &other) const {
    return status == other.status && appliedShare == other.appliedShare && reason == other.reason;
  }
};

// État appliqué à publier (message `ControlState`, hors horodatage).
struct StateToPublish {
  char setpointId[UUID_LENGTH + 1];  // chaîne vide : aucune consigne reçue (JSON `null`)
  ControlMode mode;
  ControlStatus status;
  int appliedShare;  // NO_SHARE : JSON `null`
  RejectionReason reason;
};

class Pilot {
 public:
  explicit Pilot(double initialLevel = INITIAL_BATTERY_LEVEL_PCT) : level_(initialLevel) {}

  double level() const { return level_; }
  double production() const { return production_; }
  double batteryPower() const { return output_.batteryPower; }
  double gridPower() const { return output_.gridPower; }
  ControlMode mode() const { return mode_; }
  int requestedShare() const { return requestedShare_; }
  const ControlOutput &output() const { return output_; }

  // Un état est à publier : au démarrage, après une consigne, ou après un changement de part,
  // de statut ou de raison. Reste vrai tant que `markPublished` n'a pas été appelé (publication échouée,
  // objet déconnecté).
  bool publishPending() const { return publishPending_; }
  void markPublished() {
    publishedSignature_ = signature();
    publishPending_ = false;
  }

  // État de la consigne en vigueur.
  StateToPublish state() const {
    StateToPublish state = {};
    std::memcpy(state.setpointId, setpointId_, sizeof(setpointId_));
    state.mode = mode_;
    state.status = output_.status;
    state.appliedShare = output_.appliedShare;
    state.reason = output_.reason;
    return state;
  }

  // Calcule les flux du tick courant pour la production donnée, sans faire avancer la batterie.
  void recompute(double production) {
    production_ = production;
    output_ = applyControl({mode_, requestedShare_, production_, level_, DEMO_SITE_MAX_CHARGE_POWER_W});
  }

  // Adopte une consigne valide. Renvoie true si elle est nouvelle : un état est alors à publier, même si
  // son contenu ne change pas, car l'API rattache la réponse à l'identifiant. Une consigne identique à
  // celle en vigueur (le broker renvoie la consigne retained à chaque reconnexion) ne change rien.
  bool receiveSetpoint(const ParsedSetpoint &setpoint, double production) {
    if (std::strcmp(setpoint.id, setpointId_) == 0 && setpoint.mode == mode_ &&
        setpoint.batteryShare == requestedShare_) {
      return false;
    }
    mode_ = setpoint.mode;
    requestedShare_ = setpoint.batteryShare;
    std::memcpy(setpointId_, setpoint.id, sizeof(setpointId_));
    recompute(production);
    publishPending_ = true;
    return true;
  }

  // Une consigne lisible mais invalide n'est pas adoptée : la consigne en vigueur continue de s'appliquer.
  // Renvoie true (et remplit `rejection`) s'il faut répondre `rejected` / `invalid_setpoint` pour cet
  // identifiant ; false si cet identifiant a déjà reçu sa réponse (retained renvoyée à la reconnexion).
  // L'état de la consigne en vigueur est ensuite republiqué au tick suivant, pour que l'état retained
  // reflète bien ce que fait l'objet.
  bool rejectSetpoint(const ParsedSetpoint &setpoint, StateToPublish &rejection) {
    if (std::strcmp(setpoint.id, rejectedId_) == 0) return false;
    std::memcpy(rejectedId_, setpoint.id, sizeof(rejectedId_));
    std::memcpy(rejection.setpointId, setpoint.id, sizeof(rejection.setpointId));
    rejection.mode = mode_;
    rejection.status = ControlStatus::Rejected;
    rejection.appliedShare = NO_SHARE;
    rejection.reason = RejectionReason::InvalidSetpoint;
    publishPending_ = true;
    return true;
  }

  // Avance d'un tick de `seconds` secondes réelles : met à jour la batterie, recalcule les flux, et marque
  // un état à publier si la part appliquée, le statut ou la raison a changé. Renvoie `publishPending()`.
  bool tick(double seconds, double production) {
    level_ = nextBatteryLevel(level_, output_.batteryPower, seconds, DEMO_SITE_BATTERY_CAPACITY_WH);
    recompute(production);
    if (!(signature() == publishedSignature_)) publishPending_ = true;
    return publishPending_;
  }

 private:
  StateSignature signature() const { return {output_.status, output_.appliedShare, output_.reason}; }

  ControlMode mode_ = ControlMode::Automatic;
  int requestedShare_ = NO_SHARE;
  char setpointId_[UUID_LENGTH + 1] = "";
  char rejectedId_[UUID_LENGTH + 1] = "";
  double level_;
  double production_ = 0.0;
  ControlOutput output_ = {0.0, 0.0, NO_SHARE, ControlStatus::Applied, RejectionReason::None};
  StateSignature publishedSignature_ = {ControlStatus::Applied, NO_SHARE, RejectionReason::None};
  bool publishPending_ = true;
};
