#include "enrollment.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <time.h>

#include "config.h"
#include "device_identity.h"
#include "enrollment_text.h"
#include "secrets.h"

namespace {

enum class Phase { NeedKey, NeedRequest, Polling, Ready };

// Tampons statiques : la connexion TLS garde des pointeurs vers le certificat et la clé.
DeviceIdentity identity;
char certPem[2048];
char response[3072];

Phase phase = Phase::NeedKey;
uint32_t certificateGeneration = 0;
int64_t certificateExpiresAt = 0;
unsigned long nextActionMs = 0;

void printFingerprint() {
  Serial.printf("Enrôlement de %s : comparez cette empreinte avec celle de l'app.\n", MQTT_DEVICE_ID);
  char line[FINGERPRINT_LINE_SIZE];
  for (int i = 0; i < FINGERPRINT_LINES; i++) {
    fingerprintLine(identity.fingerprint, i, line);
    Serial.printf("    %s\n", line);
  }
}

// Requête HTTP(S) vers l'API d'enrôlement. Renvoie le code HTTP (négatif si l'API est injoignable) et
// copie le corps de la réponse dans `response`.
int callApi(const char *path, const char *body) {
  char url[160];
  snprintf(url, sizeof(url), "%s%s", ENROLLMENT_URL, path);
  HTTPClient http;
  WiFiClient plain;
  WiFiClientSecure secure;
  const bool https = strncmp(url, "https://", 8) == 0;
  if (https) {
#ifdef ENROLLMENT_CA_CERT
    secure.setCACert(ENROLLMENT_CA_CERT);
#endif
    if (!http.begin(secure, url)) return -1;
  } else if (!http.begin(plain, url)) {
    return -1;
  }
  http.setTimeout(ENROLLMENT_HTTP_TIMEOUT_MS);
  http.addHeader("Accept", "application/json");
  int code;
  if (body != nullptr) {
    http.addHeader("Content-Type", "application/json");
    code = http.POST(reinterpret_cast<uint8_t *>(const_cast<char *>(body)), strlen(body));
  } else {
    code = http.GET();
  }
  response[0] = '\0';
  if (code > 0) {
    const String text = http.getString();
    snprintf(response, sizeof(response), "%s", text.c_str());
  }
  http.end();
  return code;
}

void startOver(const char *reason) {
  Serial.printf("%s : nouvelle clé et nouvelle demande.\n", reason);
  phase = Phase::NeedKey;
  certificateExpiresAt = 0;
  certPem[0] = '\0';
  nextActionMs = millis() + ENROLLMENT_POLL_PERIOD_S * 1000UL;
}

// Le certificat doit porter le nom de l'objet et sa propre clé publique (D027), sinon il est refusé.
bool certificateMatches(const char *pem) {
  char reason[96] = "";
  if (certificateMatchesIdentity(pem, identity, MQTT_DEVICE_ID, reason, sizeof(reason))) return true;
  Serial.printf("Certificat refusé : %s\n", reason);
  return false;
}

void handleDecision() {
  const EnrollmentStatus status = parseEnrollmentStatus(response);
  if (status == EnrollmentStatus::Pending) return;
  if (status != EnrollmentStatus::Active) {
    startOver(status == EnrollmentStatus::Rejected ? "Demande refusée" : "Demande expirée");
    return;
  }
  char expires[32];
  if (!jsonStringField(response, "certificate", certPem, sizeof(certPem)) ||
      !jsonStringField(response, "certificateExpiresAt", expires, sizeof(expires)) || !certificateMatches(certPem)) {
    startOver("Certificat inutilisable");
    return;
  }
  certificateExpiresAt = parseIsoUtc(expires);
  certificateGeneration++;
  phase = Phase::Ready;
  Serial.printf("Certificat reçu, valable jusqu'au %s\n", expires);
}

}  // namespace

namespace enrollment {

void loop() {
  // Comparaison par différence : reste juste quand millis() repasse par zéro.
  if (phase == Phase::Ready || static_cast<long>(millis() - nextActionMs) < 0) return;
  switch (phase) {
    case Phase::NeedKey:
      if (!generateDeviceIdentity(identity, MQTT_DEVICE_ID)) {
        Serial.println("Enrôlement : génération de la clé impossible, nouvel essai");
        nextActionMs = millis() + ENROLLMENT_RETRY_MS;
        return;
      }
      printFingerprint();
      phase = Phase::NeedRequest;
      return;
    case Phase::NeedRequest: {
      static char body[1280];
      if (!formatEnrollmentRequest(body, sizeof(body), MQTT_DEVICE_ID, identity.csrPem)) {
        startOver("Demande trop longue");
        return;
      }
      const int code = callApi("/enrollments", body);
      if (code == 202) {
        Serial.println("Demande envoyée : en attente de l'acceptation par un exploitant.");
        phase = Phase::Polling;
        nextActionMs = millis() + ENROLLMENT_POLL_PERIOD_S * 1000UL;
      } else {
        char message[200] = "";
        jsonStringField(response, "message", message, sizeof(message));
        Serial.printf("Demande refusée par l'API (code %d%s%s), nouvel essai dans %lu s\n", code,
                      message[0] ? " : " : "", message, ENROLLMENT_RETRY_MS / 1000);
        nextActionMs = millis() + ENROLLMENT_RETRY_MS;
      }
      return;
    }
    case Phase::Polling: {
      char path[96];
      snprintf(path, sizeof(path), "/enrollments/%s", identity.fingerprint);
      const int code = callApi(path, nullptr);
      nextActionMs = millis() + ENROLLMENT_POLL_PERIOD_S * 1000UL;
      if (code == 200) {
        handleDecision();
      } else {
        Serial.printf("Suivi de la demande impossible (code %d), nouvel essai\n", code);
      }
      return;
    }
    case Phase::Ready:
      return;
  }
}

bool ready() { return phase == Phase::Ready; }

uint32_t generation() { return certificateGeneration; }

const char *certificatePem() { return certPem; }

const char *privateKeyPem() { return identity.keyPem; }

void checkCertificate() {
  if (phase != Phase::Ready) return;
  if (certificateExpiresAt > 0 && static_cast<int64_t>(time(nullptr)) >= certificateExpiresAt) {
    startOver("Certificat expiré");
    return;
  }
  char path[96];
  snprintf(path, sizeof(path), "/enrollments/%s", identity.fingerprint);
  if (callApi(path, nullptr) != 200) return;  // API momentanément injoignable : on garde le certificat
  const EnrollmentStatus status = parseEnrollmentStatus(response);
  if (status == EnrollmentStatus::Revoked) {
    startOver("Certificat révoqué par un exploitant");
  } else if (status != EnrollmentStatus::Active && status != EnrollmentStatus::Unknown) {
    startOver("Certificat plus actif");
  }
}

}  // namespace enrollment
