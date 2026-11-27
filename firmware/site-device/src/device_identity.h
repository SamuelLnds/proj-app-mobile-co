// Identité de l'objet (D027) : clé P-256, demande de certificat et vérification du certificat reçu,
// avec mbedTLS seulement (sans Arduino), pour pouvoir aussi être compilé et essayé sur le poste.
#pragma once

#include <cstddef>

#include "enrollment_text.h"

struct DeviceIdentity {
  char keyPem[512];          // clé privée PEM : reste en mémoire vive, jamais affichée ni envoyée
  char csrPem[1024];         // demande de certificat PEM : données publiques
  unsigned char publicKeyDer[128];
  size_t publicKeyDerLength;
  char fingerprint[FINGERPRINT_HEX_SIZE];
};

// Génère une nouvelle clé et la demande de certificat au nom `commonName`. Renvoie false en cas d'échec.
bool generateDeviceIdentity(DeviceIdentity &identity, const char *commonName);

// Vérifie que le certificat PEM porte le nom `commonName` et la clé publique de `identity`. En cas de
// refus, `reason` reçoit la raison.
bool certificateMatchesIdentity(const char *certificatePem, const DeviceIdentity &identity, const char *commonName,
                                char *reason, size_t reasonSize);
