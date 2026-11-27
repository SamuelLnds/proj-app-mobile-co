// Identité de l'objet simulé (D027) : clé P-256 générée en mémoire, demande de certificat (CSR)
// et empreinte de la clé publique, comme l'ESP32. La clé privée ne quitte jamais le processus.
// @peculiar/x509 s'appuie sur tsyringe, qui exige ce polyfill chargé avant lui.
import "reflect-metadata";
import { createHash, webcrypto } from "node:crypto";
import * as x509 from "@peculiar/x509";

x509.cryptoProvider.set(webcrypto as unknown as Crypto);

const EC_P256 = { name: "ECDSA", namedCurve: "P-256" } as const;

export interface DeviceIdentity {
  /** Clé privée au format PEM (PKCS#8), utilisée seulement par la connexion TLS au broker. */
  privateKeyPem: string;
  /** Demande de certificat envoyée à l'API : nom et clé publique, aucune donnée secrète. */
  csrPem: string;
  /** Clé publique (SubjectPublicKeyInfo en DER). */
  publicKeyDer: Buffer;
  /** SHA-256 de la clé publique, en hexadécimal minuscule. */
  fingerprint: string;
}

const pem = (label: string, der: ArrayBuffer | Buffer) =>
  `-----BEGIN ${label}-----\n${Buffer.from(der as ArrayBuffer)
    .toString("base64")
    .match(/.{1,64}/g)!
    .join("\n")}\n-----END ${label}-----\n`;

/** Génère une nouvelle clé et sa demande de certificat au nom de l'objet. */
export async function createIdentity(deviceName: string): Promise<DeviceIdentity> {
  const keys = (await webcrypto.subtle.generateKey(EC_P256, true, [
    "sign",
    "verify",
  ])) as unknown as CryptoKeyPair;
  const csr = await x509.Pkcs10CertificateRequestGenerator.create({
    name: `CN=${deviceName}`,
    keys,
    signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
  });
  const pkcs8 = await webcrypto.subtle.exportKey("pkcs8", keys.privateKey as webcrypto.CryptoKey);
  const spki = Buffer.from(
    await webcrypto.subtle.exportKey("spki", keys.publicKey as webcrypto.CryptoKey),
  );
  return {
    privateKeyPem: pem("PRIVATE KEY", pkcs8),
    csrPem: csr.toString("pem"),
    publicKeyDer: spki,
    fingerprint: createHash("sha256").update(spki).digest("hex"),
  };
}

/** Empreinte en lignes de 4 groupes de 4 caractères, comme dans l'app (charte, « Section Objets »). */
export function fingerprintLines(fingerprint: string): string[] {
  const groups = fingerprint.toLowerCase().match(/.{1,4}/g) ?? [];
  const lines: string[] = [];
  for (let i = 0; i < groups.length; i += 4) lines.push(groups.slice(i, i + 4).join(" "));
  return lines;
}

/**
 * Vérifie le certificat reçu avant de s'en servir (D027) : le nom commun est bien celui de
 * l'objet et la clé publique est la sienne. Renvoie la raison du refus, ou `null`.
 */
export function checkCertificate(
  certificatePem: string,
  deviceName: string,
  publicKeyDer: Buffer,
): string | null {
  let certificate: x509.X509Certificate;
  try {
    certificate = new x509.X509Certificate(certificatePem);
  } catch {
    return "certificat illisible";
  }
  if (certificate.subject !== `CN=${deviceName}`)
    return `nom commun inattendu (${certificate.subject})`;
  if (!Buffer.from(certificate.publicKey.rawData).equals(publicKeyDer)) {
    return "la clé publique du certificat n'est pas celle de l'objet";
  }
  return null;
}
