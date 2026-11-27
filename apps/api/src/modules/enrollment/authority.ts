// Autorité des objets (D027, D035) : lecture des demandes de certificat, signature des
// certificats et de la liste de révocation. La clé de l'autorité est lue au moment de signer,
// jamais conservée en base ni journalisée.
// @peculiar/x509 s'appuie sur tsyringe, qui exige ce polyfill chargé avant lui.
import "reflect-metadata";
import { createHash, createPrivateKey, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as x509 from "@peculiar/x509";
import { AppError } from "../../errors";

x509.cryptoProvider.set(webcrypto as unknown as Crypto);

const EC_P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGNING_ALGORITHM = { name: "ECDSA", hash: "SHA-256" } as const;
/** Durée de validité d'une liste de révocation : elle est regénérée à chaque révocation. */
export const CRL_VALIDITY_DAYS = 825;

/** Demande de certificat lue et vérifiée. */
export interface ParsedCsr {
  /** SHA-256 de la clé publique (SubjectPublicKeyInfo en DER), en hexadécimal. */
  fingerprint: string;
}

export interface CertificateToSign {
  csrPem: string;
  /** Nom commun imposé par le serveur : celui écrit dans la demande est ignoré. */
  commonName: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
}

export interface RevokedCertificate {
  serialNumber: string;
  revokedAt: Date;
}

export interface CertificateAuthority {
  /** Signe la demande ; renvoie le certificat au format PEM. */
  sign: (request: CertificateToSign) => Promise<string>;
  /** Liste de révocation signée, au format PEM. */
  revocationList: (revoked: RevokedCertificate[], now: Date) => Promise<string>;
}

const invalidCsr = (message: string) => new AppError("INVALID_CSR", message);

/**
 * Encodage PEM attendu par OpenSSL, donc par Mosquitto : l'étiquette `X509 CRL` (la bibliothèque
 * écrit `CRL`, que le broker refuse au chargement) et une fin de ligne finale.
 */
export function toPem(label: "CERTIFICATE" | "X509 CRL", der: ArrayBuffer): string {
  const lines =
    Buffer.from(der)
      .toString("base64")
      .match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

/**
 * Lit une demande de certificat PEM : signature valide (preuve de possession de la clé) et clé
 * ECDSA P-256, celle que génère l'ESP32. Erreur `INVALID_CSR` sinon.
 */
export async function parseCsr(pem: string): Promise<ParsedCsr> {
  let csr: x509.Pkcs10CertificateRequest;
  try {
    csr = new x509.Pkcs10CertificateRequest(pem);
  } catch {
    throw invalidCsr("La demande de certificat est illisible.");
  }
  const algorithm = csr.publicKey.algorithm as EcKeyAlgorithm;
  if (algorithm.name !== EC_P256.name || algorithm.namedCurve !== EC_P256.namedCurve) {
    throw invalidCsr("La clé de la demande doit être une clé ECDSA P-256.");
  }
  const signed = await csr.verify().catch(() => false);
  if (!signed) throw invalidCsr("La signature de la demande de certificat est invalide.");
  const fingerprint = createHash("sha256").update(Buffer.from(csr.publicKey.rawData)).digest("hex");
  return { fingerprint };
}

/** Numéro de série aléatoire de 128 bits, positif (premier bit à 0), en hexadécimal. */
export function randomSerialNumber(): string {
  const bytes = webcrypto.getRandomValues(new Uint8Array(16));
  bytes[0] = bytes[0]! & 0x7f;
  return Buffer.from(bytes).toString("hex");
}

interface LoadedAuthority {
  certificate: x509.X509Certificate;
  signingKey: CryptoKey;
}

/** Autorité lue sur disque (`DEVICE_CA_CERT_PATH`, `DEVICE_CA_KEY_PATH`). */
export function createFileAuthority(certPath: string, keyPath: string): CertificateAuthority {
  async function load(): Promise<LoadedAuthority> {
    const [certPem, keyPem] = await Promise.all([readFile(certPath, "utf8"), readFile(keyPath)]);
    // Clé produite par OpenSSL (format SEC1 « EC PRIVATE KEY ») : convertie en PKCS#8 pour WebCrypto.
    const pkcs8 = createPrivateKey(keyPem).export({ type: "pkcs8", format: "der" });
    const signingKey = (await webcrypto.subtle.importKey("pkcs8", pkcs8, EC_P256, false, [
      "sign",
    ])) as unknown as CryptoKey;
    return { certificate: new x509.X509Certificate(certPem), signingKey };
  }

  return {
    async sign({ csrPem, commonName, serialNumber, notBefore, notAfter }) {
      const { certificate: ca, signingKey } = await load();
      const csr = new x509.Pkcs10CertificateRequest(csrPem);
      const certificate = await x509.X509CertificateGenerator.create({
        serialNumber,
        subject: [{ CN: [commonName] }],
        // Nom de l'émetteur repris tel quel du certificat de l'autorité, pour que la chaîne se
        // construise côté broker (comparaison octet à octet).
        issuer: ca.subjectName,
        notBefore,
        notAfter,
        publicKey: csr.publicKey,
        signingKey,
        signingAlgorithm: SIGNING_ALGORITHM,
        extensions: [
          new x509.BasicConstraintsExtension(false, undefined, true),
          new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
          new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.clientAuth]),
          await x509.SubjectKeyIdentifierExtension.create(csr.publicKey),
          await x509.AuthorityKeyIdentifierExtension.create(ca.publicKey),
        ],
      });
      return toPem("CERTIFICATE", certificate.rawData);
    },

    async revocationList(revoked, now) {
      const { certificate: ca, signingKey } = await load();
      const crl = await x509.X509CrlGenerator.create({
        issuer: ca.subjectName,
        thisUpdate: now,
        nextUpdate: new Date(now.getTime() + CRL_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
        signingAlgorithm: SIGNING_ALGORITHM,
        signingKey,
        entries: revoked.map((entry) => ({
          serialNumber: entry.serialNumber,
          revocationDate: entry.revokedAt,
        })),
        extensions: [await x509.AuthorityKeyIdentifierExtension.create(ca.publicKey)],
      });
      return toPem("X509 CRL", crl.rawData);
    },
  };
}
