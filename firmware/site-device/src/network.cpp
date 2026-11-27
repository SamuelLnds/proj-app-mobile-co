#include "network.h"

#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_sntp.h>
#include <time.h>

#include "config.h"
#include "enrollment.h"
#include "messages.h"
#include "secrets.h"

namespace {

// Wokwi-GUEST écoute sur le canal 6 : le préciser évite un balayage de 4 s.
constexpr int WIFI_CHANNEL = 6;
// Une heure antérieure à novembre 2023 signifie que NTP n'a pas encore répondu.
constexpr time_t MIN_VALID_EPOCH = 1700000000;

WiFiClientSecure tlsClient;
PubSubClient mqtt(tlsClient);

bool wifiWasConnected = false;
bool ntpStarted = false;
bool timeWasValid = false;
bool mqttWasConnected = false;
unsigned long mqttConnectedAtMs = 0;
unsigned long ntpStartedAtMs = 0;
unsigned long lastWifiAttemptMs = 0;
unsigned long lastMqttAttemptMs = 0;
// Certificat en place dans la connexion TLS, refus successifs du broker, dernier contrôle du certificat.
uint32_t appliedGeneration = 0;
int mqttFailures = 0;
unsigned long lastCertificateCheckMs = 0;

// Consigne reçue, en attente d'être lue par main.cpp (un seul emplacement : PubSubClient::loop() ne
// traite qu'un paquet par appel et main.cpp vide l'emplacement entre deux appels).
char pendingSetpoint[network::SETPOINT_SLOT_SIZE];
size_t pendingSetpointLength = 0;
bool hasPendingSetpoint = false;

bool timeIsValid() { return time(nullptr) > MIN_VALID_EPOCH; }

void buildTopic(char *out, size_t size, const char *subtopic) {
  snprintf(out, size, "solar/%s/%s", SITE_CODE, subtopic);
}

// L'intervalle est une variable du module SNTP, conservée par sntp_stop() : le régler avant configTime()
// (qui appelle sntp_init()) suffit. Mode par défaut SNTP_SYNC_MODE_IMMED : l'heure est corrigée aussitôt.
void startNtp() {
  sntp_set_sync_interval(NTP_RESYNC_INTERVAL_MS);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  ntpStarted = true;
  ntpStartedAtMs = millis();
}

// Rappel de PubSubClient : le seul abonnement est celui des consignes. Le message est copié tel quel ;
// un message plus grand que l'emplacement est ignoré (une consigne de l'API fait environ 130 octets).
void onMessage(char *topic, uint8_t *payload, unsigned int length) {
  char setpointTopic[64];
  buildTopic(setpointTopic, sizeof(setpointTopic), "setpoint");
  if (strcmp(topic, setpointTopic) != 0) return;
  if (length >= sizeof(pendingSetpoint)) {
    Serial.printf("Consigne ignorée : message trop long (%u octets)\n", length);
    return;
  }
  memcpy(pendingSetpoint, payload, length);
  pendingSetpoint[length] = '\0';
  pendingSetpointLength = length;
  hasPendingSetpoint = true;
}

// Le Last Will est enregistré auprès du broker à la connexion ; `online` est publié ensuite. L'objet
// s'authentifie par son certificat client (D027) : ni identifiant ni mot de passe.
bool connectMqtt() {
  char statusTopic[64];
  char willPayload[MESSAGE_BUFFER_SIZE];
  char onlinePayload[MESSAGE_BUFFER_SIZE];
  buildTopic(statusTopic, sizeof(statusTopic), "status");
  formatDeviceStatus(willPayload, sizeof(willPayload), false, nullptr);
  formatDeviceStatus(onlinePayload, sizeof(onlinePayload), true, FIRMWARE_VERSION);

  Serial.printf("MQTT : connexion à %s:%d (TLS mutuel)\n", MQTT_HOST, MQTT_PORT);
  const bool connected =
      mqtt.connect(MQTT_DEVICE_ID, statusTopic, 1 /* QoS du Last Will */, true /* retained */, willPayload);
  if (!connected) {
    char tlsError[100] = "";
    tlsClient.lastError(tlsError, sizeof(tlsError));
    Serial.printf("MQTT : échec (code %d%s%s)\n", mqtt.state(), tlsError[0] ? ", TLS : " : "", tlsError);
    return false;
  }
  mqtt.publish(statusTopic, onlinePayload, true);
  Serial.println("MQTT : connecté, statut online publié");

  // Abonnement aux consignes en QoS 1 (PubSubClient accepte 0 ou 1) : le broker renvoie la dernière
  // consigne retained, qui est ainsi appliquée après chaque (re)connexion.
  char setpointTopic[64];
  buildTopic(setpointTopic, sizeof(setpointTopic), "setpoint");
  if (mqtt.subscribe(setpointTopic, 1)) {
    Serial.printf("MQTT : abonné à %s (QoS 1)\n", setpointTopic);
  } else {
    Serial.printf("MQTT : abonnement à %s refusé\n", setpointTopic);
  }
  return true;
}

}  // namespace

namespace network {

void begin() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD, WIFI_CHANNEL);
  Serial.printf("WiFi : connexion à %s\n", WIFI_SSID);

  tlsClient.setCACert(MQTT_CA_CERT);
  tlsClient.setTimeout(5);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqtt.setBufferSize(MQTT_BUFFER_SIZE);
  mqtt.setKeepAlive(MQTT_KEEPALIVE_S);
  mqtt.setSocketTimeout(MQTT_SOCKET_TIMEOUT_S);
}

void loop() {
  const unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    if (wifiWasConnected) {
      Serial.println("WiFi : connexion perdue");
      wifiWasConnected = false;
    }
    if (now - lastWifiAttemptMs >= RECONNECT_INTERVAL_MS) {
      lastWifiAttemptMs = now;
      WiFi.reconnect();
    }
    return;
  }
  if (!wifiWasConnected) {
    wifiWasConnected = true;
    Serial.printf("WiFi : connecté (%s)\n", WiFi.localIP().toString().c_str());
  }

  // L'heure doit être exacte avant tout TLS : le certificat du broker a une période de validité.
  if (!ntpStarted) startNtp();
  if (!timeIsValid()) {
    if (now - ntpStartedAtMs >= NTP_TIMEOUT_MS) {
      Serial.println("NTP : pas de réponse, nouvelle tentative");
      startNtp();
    }
    return;
  }
  if (!timeWasValid) {
    timeWasValid = true;
    Serial.println("NTP : heure synchronisée");
  }

  // Sans certificat valide, l'objet s'enrôle d'abord (la session MQTT éventuelle est fermée).
  if (!enrollment::ready()) {
    if (mqtt.connected()) {
      mqtt.disconnect();
      mqttWasConnected = false;
    }
    enrollment::loop();
    return;
  }
  if (appliedGeneration != enrollment::generation()) {
    tlsClient.stop();
    tlsClient.setCertificate(enrollment::certificatePem());
    tlsClient.setPrivateKey(enrollment::privateKeyPem());
    appliedGeneration = enrollment::generation();
    mqttFailures = 0;
    lastMqttAttemptMs = 0;
  }

  if (!mqtt.connected()) {
    if (mqttWasConnected) {
      Serial.println("MQTT : session perdue");
      mqttWasConnected = false;
    }
    if (now - lastMqttAttemptMs >= RECONNECT_INTERVAL_MS || lastMqttAttemptMs == 0) {
      lastMqttAttemptMs = now == 0 ? 1 : now;
      mqttWasConnected = connectMqtt();
      if (mqttWasConnected) {
        mqttConnectedAtMs = millis();
        lastCertificateCheckMs = mqttConnectedAtMs;
        mqttFailures = 0;
      } else if (++mqttFailures >= MQTT_FAILURES_BEFORE_CHECK) {
        // Refus répétés : certificat peut-être révoqué ou expiré, l'API le dit.
        mqttFailures = 0;
        enrollment::checkCertificate();
      }
    }
    return;
  }
  mqtt.loop();
  if (millis() - lastCertificateCheckMs >= CERTIFICATE_CHECK_PERIOD_MS) {
    lastCertificateCheckMs = millis();
    enrollment::checkCertificate();
  }
}

bool isMqttConnected() { return mqtt.connected(); }

unsigned long mqttConnectedForMs() { return mqtt.connected() ? millis() - mqttConnectedAtMs : 0; }

int64_t epochSeconds() { return timeIsValid() ? static_cast<int64_t>(time(nullptr)) : 0; }

bool publish(const char *subtopic, const char *payload, bool retained) {
  char topic[64];
  buildTopic(topic, sizeof(topic), subtopic);
  return mqtt.publish(topic, payload, retained);
}

bool takeSetpoint(char *out, size_t size, size_t &length) {
  if (!hasPendingSetpoint || size <= pendingSetpointLength) return false;
  memcpy(out, pendingSetpoint, pendingSetpointLength + 1);
  length = pendingSetpointLength;
  hasPendingSetpoint = false;
  return true;
}

}  // namespace network
