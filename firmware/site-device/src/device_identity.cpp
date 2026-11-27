#include "device_identity.h"

#include <cstdio>
#include <cstring>

#include <mbedtls/ctr_drbg.h>
#include <mbedtls/ecp.h>
#include <mbedtls/entropy.h>
#include <mbedtls/pk.h>
#include <mbedtls/sha256.h>
#include <mbedtls/version.h>
#include <mbedtls/x509_crt.h>
#include <mbedtls/x509_csr.h>

namespace {

// mbedTLS 2.28 (ESP32, Arduino) et 3.x (poste) : la fonction SHA-256 a changé de nom.
int sha256(const unsigned char *input, size_t length, unsigned char output[32]) {
#if MBEDTLS_VERSION_MAJOR >= 3
  return mbedtls_sha256(input, length, output, 0);
#else
  return mbedtls_sha256_ret(input, length, output, 0);
#endif
}

// Clé publique (SubjectPublicKeyInfo en DER). mbedTLS écrit à la FIN du tampon et renvoie la longueur.
size_t writePublicKeyDer(mbedtls_pk_context *pk, unsigned char *out, size_t size) {
  unsigned char buffer[160];
  const int length = mbedtls_pk_write_pubkey_der(pk, buffer, sizeof(buffer));
  if (length <= 0 || static_cast<size_t>(length) > size) return 0;
  std::memcpy(out, buffer + sizeof(buffer) - length, length);
  return static_cast<size_t>(length);
}

}  // namespace

bool generateDeviceIdentity(DeviceIdentity &identity, const char *commonName) {
  mbedtls_entropy_context entropy;
  mbedtls_ctr_drbg_context drbg;
  mbedtls_pk_context key;
  mbedtls_x509write_csr csr;
  mbedtls_entropy_init(&entropy);
  mbedtls_ctr_drbg_init(&drbg);
  mbedtls_pk_init(&key);
  mbedtls_x509write_csr_init(&csr);

  static const char personalization[] = "solar-device-enrollment";
  char subject[64];
  std::snprintf(subject, sizeof(subject), "CN=%s", commonName);
  bool ok =
      mbedtls_ctr_drbg_seed(&drbg, mbedtls_entropy_func, &entropy,
                            reinterpret_cast<const unsigned char *>(personalization), sizeof(personalization)) == 0 &&
      mbedtls_pk_setup(&key, mbedtls_pk_info_from_type(MBEDTLS_PK_ECKEY)) == 0 &&
      mbedtls_ecp_gen_key(MBEDTLS_ECP_DP_SECP256R1, mbedtls_pk_ec(key), mbedtls_ctr_drbg_random, &drbg) == 0;
  if (ok) {
    mbedtls_x509write_csr_set_key(&csr, &key);
    mbedtls_x509write_csr_set_md_alg(&csr, MBEDTLS_MD_SHA256);
    ok = mbedtls_x509write_csr_set_subject_name(&csr, subject) == 0 &&
         mbedtls_x509write_csr_pem(&csr, reinterpret_cast<unsigned char *>(identity.csrPem), sizeof(identity.csrPem),
                                   mbedtls_ctr_drbg_random, &drbg) == 0 &&
         mbedtls_pk_write_key_pem(&key, reinterpret_cast<unsigned char *>(identity.keyPem), sizeof(identity.keyPem)) ==
             0;
  }
  if (ok) {
    identity.publicKeyDerLength = writePublicKeyDer(&key, identity.publicKeyDer, sizeof(identity.publicKeyDer));
    uint8_t digest[32];
    ok = identity.publicKeyDerLength > 0 &&
         sha256(identity.publicKeyDer, identity.publicKeyDerLength, digest) == 0;
    if (ok) fingerprintHex(digest, identity.fingerprint);
  }

  mbedtls_x509write_csr_free(&csr);
  mbedtls_pk_free(&key);
  mbedtls_ctr_drbg_free(&drbg);
  mbedtls_entropy_free(&entropy);
  return ok;
}

bool certificateMatchesIdentity(const char *certificatePem, const DeviceIdentity &identity, const char *commonName,
                                char *reason, size_t reasonSize) {
  mbedtls_x509_crt crt;
  mbedtls_x509_crt_init(&crt);
  bool ok = mbedtls_x509_crt_parse(&crt, reinterpret_cast<const unsigned char *>(certificatePem),
                                   std::strlen(certificatePem) + 1) == 0;
  if (!ok) std::snprintf(reason, reasonSize, "certificat illisible");
  if (ok) {
    char subject[96] = "";
    char expected[64];
    std::snprintf(expected, sizeof(expected), "CN=%s", commonName);
    ok = mbedtls_x509_dn_gets(subject, sizeof(subject), &crt.subject) > 0 && std::strcmp(subject, expected) == 0;
    if (!ok) std::snprintf(reason, reasonSize, "nom commun inattendu (%s)", subject);
  }
  if (ok) {
    unsigned char certificateKey[128];
    const size_t length = writePublicKeyDer(&crt.pk, certificateKey, sizeof(certificateKey));
    ok = length == identity.publicKeyDerLength && std::memcmp(certificateKey, identity.publicKeyDer, length) == 0;
    if (!ok) std::snprintf(reason, reasonSize, "la clé publique n'est pas celle de l'objet");
  }
  mbedtls_x509_crt_free(&crt);
  return ok;
}
