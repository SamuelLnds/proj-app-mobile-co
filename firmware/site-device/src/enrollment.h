// Enrôlement de l'objet (D027, #83) : clé P-256 générée en mémoire, demande de certificat à l'API,
// suivi jusqu'à la décision de l'exploitant, vérification du certificat reçu. Aucun secret n'est écrit
// dans le firmware ni envoyé : la clé privée reste en mémoire vive.
#pragma once

#include <cstdint>

namespace enrollment {

// À appeler à chaque tour tant que ready() est faux (WiFi connecté et heure NTP valide) : génère la clé,
// envoie la demande, puis suit la décision toutes les ENROLLMENT_POLL_PERIOD_S secondes.
void loop();

// Vrai quand un certificat vérifié est disponible pour la connexion TLS mutuelle.
bool ready();

// Incrémenté à chaque nouveau certificat : la connexion TLS doit alors être reconfigurée.
uint32_t generation();

// Certificat et clé privée au format PEM, valables tant que ready() est vrai.
const char *certificatePem();
const char *privateKeyPem();

// Interroge l'API : si le certificat n'est plus actif (révoqué, expiré) ou a passé sa date de fin,
// abandonne la clé et recommence l'enrôlement. Appelé périodiquement une fois connecté, et après des
// refus de connexion du broker.
void checkCertificate();

}  // namespace enrollment
