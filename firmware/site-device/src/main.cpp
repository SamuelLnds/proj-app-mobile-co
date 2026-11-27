// Objet du site : pilotage de la batterie et publication MQTT.
// - chaque seconde : batterie, flux, relais et barre de LED (algorithme de la section 7 de l'UML) ;
// - toutes les SITE_MEASUREMENT_PERIOD_S secondes : mesure `SiteMeasurement` ;
// - à la réception d'une consigne (solar/SITE01/setpoint) : application immédiate et état `ControlState`.
// La logique de pilotage est dans include/pilot.h, control.h et setpoint.h (sans Arduino, testées sur le poste).
#include <Arduino.h>

#include "config.h"
#include "messages.h"
#include "network.h"
#include "pilot.h"
#include "readings.h"
#include "sensors.h"
#include "setpoint.h"

// L'enrôlement (clé P-256, demande de certificat, client HTTP) dépasse la pile par défaut de 8 Ko de
// loop() : sans cette ligne, la pile déborde juste après la synchronisation de l'heure.
SET_LOOP_TASK_STACK_SIZE(24 * 1024);

namespace {

Pilot pilot;
unsigned long lastTickMs = 0;
unsigned long lastMeasurementMs = 0;
bool measuredOnce = false;

const char *modeLabel(ControlMode mode) {
  switch (mode) {
    case ControlMode::Manual: return "manuel";
    case ControlMode::Automatic: return "automatique";
    case ControlMode::Discharge: return "restitution";
  }
  return "?";
}

const char *statusLabel(ControlStatus status) {
  switch (status) {
    case ControlStatus::Applied: return "appliquée";
    case ControlStatus::Partial: return "appliquée en partie";
    case ControlStatus::Rejected: return "refusée";
  }
  return "?";
}

const char *reasonLabel(RejectionReason reason) {
  switch (reason) {
    case RejectionReason::None: return "";
    case RejectionReason::BatteryFull: return "batterie pleine";
    case RejectionReason::BatteryLow: return "batterie faible";
    case RejectionReason::ChargeLimit: return "limite de charge";
    case RejectionReason::InvalidSetpoint: return "consigne invalide";
  }
  return "";
}

// Ligne lisible de la consigne en vigueur et de son résultat, par exemple
// « manuel 70 % -> appliquée 70 % » ou « manuel 100 % -> appliquée en partie 75 % (limite de charge) ».
void describeInForce(const StateToPublish &state, int requestedShare, char *out, size_t size) {
  char requested[16] = "";
  if (requestedShare != NO_SHARE) snprintf(requested, sizeof(requested), " %d %%", requestedShare);
  char applied[16] = "";
  if (state.appliedShare != NO_SHARE) snprintf(applied, sizeof(applied), " %d %%", state.appliedShare);
  const char *reason = reasonLabel(state.reason);
  snprintf(out, size, "%s%s -> %s%s%s%s%s", modeLabel(state.mode), requested, statusLabel(state.status), applied,
           reason[0] ? " (" : "", reason, reason[0] ? ")" : "");
}

// Publie un état (retained). Renvoie false si l'heure n'est pas valide, si le message est hors schéma
// ou si la publication échoue.
bool publishState(const StateToPublish &state) {
  char payload[MESSAGE_BUFFER_SIZE];
  if (!formatControlState(payload, sizeof(payload), network::epochSeconds(), state)) {
    Serial.println("État : message hors schéma ou heure invalide, non publié");
    return false;
  }
  if (!network::publish("state", payload, true)) {
    Serial.println("État : échec de la publication");
    return false;
  }
  Serial.printf("État publié : %s\n", payload);
  return true;
}

// Publie l'état de la consigne en vigueur s'il est en attente et si le broker est joignable ; sinon il
// reste en attente et part à la prochaine tentative (chaque seconde).
void publishPendingState(const char *prefix) {
  if (!pilot.publishPending() || !network::isMqttConnected() || network::epochSeconds() == 0) return;
  const StateToPublish state = pilot.state();
  char line[96];
  describeInForce(state, pilot.requestedShare(), line, sizeof(line));
  Serial.printf("%s : %s\n", prefix, line);
  if (publishState(state)) pilot.markPublished();
}

void applyOutputs() { sensors::applyOutputs(pilot.level(), pilot.batteryPower(), pilot.gridPower()); }

// Consigne reçue : analyse, application immédiate (dans la seconde) et publication de l'état.
void handleSetpoint(const char *payload, size_t length) {
  const ParsedSetpoint setpoint = parseSetpoint(payload, length);

  if (setpoint.verdict == SetpointVerdict::Unreadable) {
    Serial.printf("Consigne illisible, ignorée (%u octets) : %.60s\n", static_cast<unsigned>(length), payload);
    return;
  }

  char shortId[9];
  snprintf(shortId, sizeof(shortId), "%.8s", setpoint.id);

  if (setpoint.verdict == SetpointVerdict::Invalid) {
    Serial.printf("Consigne reçue : id %s… invalide\n", shortId);
    StateToPublish rejection;
    if (pilot.rejectSetpoint(setpoint, rejection)) {
      Serial.println("Consigne : invalide -> refusée (consigne invalide)");
      publishState(rejection);
    } else {
      Serial.println("Consigne : déjà refusée, rien à publier");
    }
    return;
  }

  char share[16] = "";
  if (setpoint.batteryShare != NO_SHARE) snprintf(share, sizeof(share), " %d %%", setpoint.batteryShare);
  Serial.printf("Consigne reçue : id %s… %s%s\n", shortId, modeLabel(setpoint.mode), share);
  if (!pilot.receiveSetpoint(setpoint, sensors::readProduction())) {
    Serial.println("Consigne : identique à celle en vigueur, rien à publier");
    return;
  }
  applyOutputs();
  publishPendingState("Consigne");
}

// Un tick de pilotage : batterie, flux, relais, barre de LED, puis publication de l'état s'il a changé.
void controlTick() {
  const unsigned long now = millis();
  const double seconds = static_cast<double>(now - lastTickMs) / 1000.0;  // durée réelle écoulée
  lastTickMs = now;
  pilot.tick(seconds, sensors::readProduction());
  applyOutputs();
  if (network::mqttConnectedForMs() >= STATE_SETTLE_AFTER_CONNECT_MS) publishPendingState("État");
}

void publishMeasurement() {
  float temperature = 0.0f;
  if (!sensors::readTemperature(temperature)) {
    Serial.println("DS18B20 : sonde absente, mesure non publiée");
    return;
  }

  // Production, niveau et flux viennent du dernier tick : ils forment un ensemble cohérent
  // (production = puissance batterie + puissance réseau).
  SiteMeasurementData data = {};
  data.epochSeconds = network::epochSeconds();
  data.irradiance = sensors::readIrradiance();
  data.production = static_cast<float>(pilot.production());
  data.temperature = temperature;
  data.batteryLevel = static_cast<float>(pilot.level());
  data.batteryPower = static_cast<float>(pilot.batteryPower());
  data.gridPower = static_cast<float>(pilot.gridPower());
  data.mode = modeName(pilot.mode());
  data.simulatedFault = sensors::simulatedFault();

  // Valeurs lisibles des capteurs, pour les régler dans Wokwi sans lire le JSON publié.
  const float potPercent = clampFloat(
      data.production * (data.simulatedFault ? FAULT_PRODUCTION_DIVISOR : 1.0f) / DEMO_SITE_PEAK_POWER_W * 100.0f,
      0.0f, 100.0f);
  Serial.printf("Capteurs : lumière %.0f W/m² | potentiomètre %.0f %% -> production %.0f W%s | température %.1f °C\n",
                data.irradiance, potPercent, data.production, data.simulatedFault ? " (panne ÷5)" : "",
                data.temperature);

  char payload[MESSAGE_BUFFER_SIZE];
  if (!formatSiteMeasurement(payload, sizeof(payload), data)) {
    Serial.println("Mesure hors bornes, non publiée");
    return;
  }
  if (network::publish("measurements", payload, false)) {
    Serial.printf("Mesure : %s\n", payload);
  } else {
    Serial.println("Mesure : échec de la publication");
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.printf("Parc solaire - objet du site %s, firmware %s\n", SITE_CODE, FIRMWARE_VERSION);
  sensors::begin();
  pilot.recompute(sensors::readProduction());
  applyOutputs();
  lastTickMs = millis();
  network::begin();
}

void loop() {
  network::loop();
  sensors::pollFaultButton();

  // Consigne reçue : traitée tout de suite, sans attendre le tick ni la mesure.
  char setpointText[network::SETPOINT_SLOT_SIZE];
  size_t setpointLength = 0;
  if (network::takeSetpoint(setpointText, sizeof(setpointText), setpointLength)) {
    handleSetpoint(setpointText, setpointLength);
  }

  const unsigned long now = millis();
  if (now - lastTickMs >= CONTROL_TICK_PERIOD_MS) controlTick();

  const bool due = !measuredOnce || now - lastMeasurementMs >= SITE_MEASUREMENT_PERIOD_S * 1000UL;
  if (due && network::isMqttConnected() && network::epochSeconds() > 0) {
    measuredOnce = true;
    lastMeasurementMs = now;
    publishMeasurement();
  }

  // Laisse la main à l'ordonnanceur : le firmware tourne dans Wokwi à environ 50 % du temps réel.
  delay(2);
}
