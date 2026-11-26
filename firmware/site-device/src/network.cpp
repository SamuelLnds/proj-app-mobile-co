#include "network.h"

#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_sntp.h>
#include <time.h>

#include "config.h"
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
unsigned long ntpStartedAtMs = 0;
unsigned long lastWifiAttemptMs = 0;
unsigned long lastMqttAttemptMs = 0;

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

// Le Last Will est enregistré auprès du broker à la connexion ; `online` est publié ensuite.
bool connectMqtt() {
  char statusTopic[64];
  char willPayload[MESSAGE_BUFFER_SIZE];
  char onlinePayload[MESSAGE_BUFFER_SIZE];
  buildTopic(statusTopic, sizeof(statusTopic), "status");
  formatDeviceStatus(willPayload, sizeof(willPayload), false, nullptr);
  formatDeviceStatus(onlinePayload, sizeof(onlinePayload), true, FIRMWARE_VERSION);

  Serial.printf("MQTT : connexion à %s:%d (TLS)\n", MQTT_HOST, MQTT_PORT);
  const bool connected = mqtt.connect(MQTT_DEVICE_ID, MQTT_USERNAME, MQTT_PASSWORD, statusTopic,
                                      1 /* QoS du Last Will */, true /* retained */, willPayload);
  if (!connected) {
    char tlsError[100] = "";
    tlsClient.lastError(tlsError, sizeof(tlsError));
    Serial.printf("MQTT : échec (code %d%s%s)\n", mqtt.state(), tlsError[0] ? ", TLS : " : "", tlsError);
    return false;
  }
  mqtt.publish(statusTopic, onlinePayload, true);
  Serial.println("MQTT : connecté, statut online publié");
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
  mqtt.setBufferSize(512);
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

  if (!mqtt.connected()) {
    if (mqttWasConnected) {
      Serial.println("MQTT : session perdue");
      mqttWasConnected = false;
    }
    if (now - lastMqttAttemptMs >= RECONNECT_INTERVAL_MS || lastMqttAttemptMs == 0) {
      lastMqttAttemptMs = now == 0 ? 1 : now;
      mqttWasConnected = connectMqtt();
    }
    return;
  }
  mqtt.loop();
}

bool isMqttConnected() { return mqtt.connected(); }

int64_t epochSeconds() { return timeIsValid() ? static_cast<int64_t>(time(nullptr)) : 0; }

bool publish(const char *subtopic, const char *payload, bool retained) {
  char topic[64];
  buildTopic(topic, sizeof(topic), subtopic);
  return mqtt.publish(topic, payload, retained);
}

}  // namespace network
