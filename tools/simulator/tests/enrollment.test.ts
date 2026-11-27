import "reflect-metadata";
import { createHash, webcrypto } from "node:crypto";
import * as x509 from "@peculiar/x509";
import type { IClientOptions } from "mqtt";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { loadConfig, type Config } from "../src/config";
import { enroll, type EnrollmentDeps } from "../src/device/enrollment";
import { checkCertificate, createIdentity, fingerprintLines } from "../src/device/identity";
import {
  buildDeviceConnectOptions,
  startEnrolledDevice,
  type EnrolledDeviceClient,
} from "../src/device/run-enrolled-device";

x509.cryptoProvider.set(webcrypto as unknown as Crypto);
const SHA256_ECDSA = { name: "ECDSA", hash: "SHA-256" } as const;

const CONFIG: Config = loadConfig({
  MQTT_URL: "mqtt://127.0.0.1:1883",
  MQTT_USERNAME: "simulator",
  MQTT_PASSWORD: "secret-de-test",
  SITE_CODE: "SITE01",
  SIMULATE_DEVICE: "true",
});

/** Certificat signé par une autorité de test pour la clé publique d'un CSR, au nom choisi. */
async function issue(csrPem: string, commonName = "device-site01", hoursValid = 8) {
  const caKeys = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as unknown as CryptoKeyPair;
  const csr = new x509.Pkcs10CertificateRequest(csrPem);
  const certificate = await x509.X509CertificateGenerator.create({
    subject: `CN=${commonName}`,
    issuer: "CN=Autorite de test",
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + hoursValid * 3_600_000),
    publicKey: csr.publicKey,
    signingKey: caKeys.privateKey,
    signingAlgorithm: SHA256_ECDSA,
  });
  return certificate.toString("pem");
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const statusBody = (fingerprint: string, status: string, certificate: string | null = null) => ({
  fingerprint,
  status,
  pendingExpiresAt: "2026-11-27T10:30:00.000Z",
  certificate,
  certificateExpiresAt: certificate ? new Date(Date.now() + 8 * 3_600_000).toISOString() : null,
});

describe("configuration du mode objet", () => {
  it("donne le nom device-<site> et les adresses du développement par défaut", () => {
    expect(CONFIG.DEVICE_NAME).toBe("device-site01");
    expect(CONFIG.API_URL).toBe("http://127.0.0.1:3000/v1");
    expect(CONFIG.DEVICE_MQTT_URL).toBe("mqtts://localhost:8883");
  });

  it("refuse une connexion de l'objet sans TLS", () => {
    expect(() =>
      loadConfig({
        ...process.env,
        ...CONFIG,
        SIMULATE_DEVICE: "true",
        DEVICE_MQTT_URL: "mqtt://localhost:1883",
      } as never),
    ).toThrow(/DEVICE_MQTT_URL/);
  });
});

describe("identité de l'objet", () => {
  it("génère une clé P-256 et un CSR signé, au nom de l'objet, sans clé privée", async () => {
    const identity = await createIdentity("device-site01");
    const csr = new x509.Pkcs10CertificateRequest(identity.csrPem);
    expect(csr.subject).toBe("CN=device-site01");
    expect(await csr.verify()).toBe(true);
    expect(identity.csrPem).not.toContain("PRIVATE");
    expect(identity.fingerprint).toBe(
      createHash("sha256").update(Buffer.from(csr.publicKey.rawData)).digest("hex"),
    );
    expect(identity.privateKeyPem).toContain("BEGIN PRIVATE KEY");
  });

  it("affiche l'empreinte comme l'app : 4 lignes de 4 groupes", () => {
    const lines = fingerprintLines(
      "3fa94c0e7b21d85a6e0f4c93b7d2a1e58c6b0f37d49e2a1c85b7f6e03d9a4c21",
    );
    expect(lines).toEqual([
      "3fa9 4c0e 7b21 d85a",
      "6e0f 4c93 b7d2 a1e5",
      "8c6b 0f37 d49e 2a1c",
      "85b7 f6e0 3d9a 4c21",
    ]);
  });

  it("vérifie le certificat reçu : son nom commun et sa clé publique", async () => {
    const identity = await createIdentity("device-site01");
    const good = await issue(identity.csrPem);
    expect(checkCertificate(good, "device-site01", identity.publicKeyDer)).toBeNull();
    const otherName = await issue(identity.csrPem, "device-pirate");
    expect(checkCertificate(otherName, "device-site01", identity.publicKeyDer)).toMatch(
      /nom commun/,
    );
    const other = await createIdentity("device-site01");
    const otherKey = await issue(other.csrPem);
    expect(checkCertificate(otherKey, "device-site01", identity.publicKeyDer)).toMatch(
      /clé publique/,
    );
  });
});

/** Fausse API d'enrôlement : réponses programmées, requêtes enregistrées. */
function fakeApi(responder: (method: string, url: string, body: string | null) => Response) {
  const requests: Array<{ method: string; url: string; body: string | null }> = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : null;
    requests.push({ method, url: String(url), body });
    return responder(method, String(url), body);
  }) as unknown as typeof fetch;
  return { fetchFn, requests };
}

function deps(fetchFn: typeof fetch, logs: string[]): EnrollmentDeps {
  return {
    apiUrl: "http://api.test/v1",
    fetch: fetchFn,
    log: (message) => logs.push(message),
    sleep: async () => undefined,
    stopped: () => false,
  };
}

describe("enrôlement", () => {
  it("affiche l'empreinte, renouvelle une demande refusée (409), puis reçoit le certificat", async () => {
    const identity = await createIdentity("device-site01");
    const certificate = await issue(identity.csrPem);
    let posts = 0;
    let polls = 0;
    const { fetchFn, requests } = fakeApi((method) => {
      if (method === "POST") {
        posts++;
        return posts === 1
          ? json(409, {
              error: { code: "ENROLLMENT_PENDING", message: "Autre demande", details: null },
            })
          : json(202, statusBody(identity.fingerprint, "pending"));
      }
      polls++;
      return json(
        200,
        statusBody(
          identity.fingerprint,
          polls < 3 ? "pending" : "active",
          polls < 3 ? null : certificate,
        ),
      );
    });
    const logs: string[] = [];
    const issued = await enroll("device-site01", identity, deps(fetchFn, logs));
    expect(issued?.certificatePem).toBe(certificate);
    expect(posts).toBe(2);
    expect(logs).toContain(`    ${fingerprintLines(identity.fingerprint)[0]}`);
    expect(logs.some((l) => l.includes("ENROLLMENT_PENDING"))).toBe(true);
    expect(requests.at(-1)!.url).toBe(`http://api.test/v1/enrollments/${identity.fingerprint}`);
    for (const request of requests) expect(request.body ?? "").not.toContain("PRIVATE");
  });

  it("abandonne une demande refusée par l'exploitant", async () => {
    const identity = await createIdentity("device-site01");
    const { fetchFn } = fakeApi((method) =>
      method === "POST"
        ? json(202, statusBody(identity.fingerprint, "pending"))
        : json(200, statusBody(identity.fingerprint, "rejected")),
    );
    const logs: string[] = [];
    expect(await enroll("device-site01", identity, deps(fetchFn, logs))).toBeNull();
    expect(logs.some((l) => l.includes("refusée"))).toBe(true);
  });

  it("refuse un certificat émis à un autre nom", async () => {
    const identity = await createIdentity("device-site01");
    const wrong = await issue(identity.csrPem, "device-pirate");
    const { fetchFn } = fakeApi((method) =>
      method === "POST"
        ? json(202, statusBody(identity.fingerprint, "pending"))
        : json(200, statusBody(identity.fingerprint, "active", wrong)),
    );
    expect(await enroll("device-site01", identity, deps(fetchFn, []))).toBeNull();
  });
});

describe("cycle de l'objet enrôlé", () => {
  it("se connecte sur 8883 avec son certificat, sans mot de passe, et recommence après une révocation", async () => {
    const connections: Array<{
      url: string;
      options: IClientOptions;
      client: EnrolledDeviceClient;
    }> = [];
    const csrs: string[] = [];
    let revoked = false;
    let stop: () => void = () => undefined;
    const { fetchFn } = fakeApi((method, url, body) => {
      if (method === "POST") {
        const { csr } = JSON.parse(body!) as { csr: string };
        csrs.push(csr);
        // Deuxième demande, après la révocation : le test s'arrête là.
        if (csrs.length === 2) stop();
        const fingerprint = createHash("sha256")
          .update(Buffer.from(new x509.Pkcs10CertificateRequest(csr).publicKey.rawData))
          .digest("hex");
        return json(202, statusBody(fingerprint, "pending"));
      }
      const fingerprint = url.split("/").pop()!;
      return json(
        200,
        statusBody(
          fingerprint,
          revoked ? "revoked" : "active",
          revoked ? null : certificateFor.get(fingerprint)!,
        ),
      );
    });
    const certificateFor = new Map<string, string>();
    const originalFetch = fetchFn;
    const fetchWithIssue = (async (url: string | URL | Request, init?: RequestInit) => {
      const response = await originalFetch(url, init);
      if ((init?.method ?? "GET") === "POST") {
        const { csr } = JSON.parse(String(init!.body)) as { csr: string };
        const { fingerprint } = (await response.clone().json()) as { fingerprint: string };
        certificateFor.set(fingerprint, await issue(csr));
      }
      return response;
    }) as typeof fetch;

    let sleeps = 0;
    stop = startEnrolledDevice(CONFIG, {
      fetch: fetchWithIssue,
      log: () => undefined,
      readCa: () => "-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----\n",
      sleep: async () => {
        sleeps++;
        // Une fois connecté, le contrôle suivant découvre la révocation.
        if (connections.length > 0) revoked = true;
        await new Promise((resolve) => setImmediate(resolve));
      },
      connect: (url, options) => {
        const emitter = new EventEmitter();
        const client = Object.assign(emitter, {
          publish: vi.fn(),
          subscribe: vi.fn(),
          end: vi.fn(),
          connected: true,
        }) as unknown as EnrolledDeviceClient;
        connections.push({ url, options, client });
        return client;
      },
    });

    await vi.waitFor(() => expect(csrs).toHaveLength(2), { timeout: 5000 });
    expect(sleeps).toBeGreaterThan(0);
    expect(connections).toHaveLength(1);
    const { url, options, client } = connections[0]!;
    expect(url).toBe("mqtts://localhost:8883");
    expect(options.username).toBeUndefined();
    expect(options.password).toBeUndefined();
    expect(options.clientId).toBe("device-site01");
    expect(String(options.cert)).toContain("BEGIN CERTIFICATE");
    expect(options.rejectUnauthorized).toBe(true);
    expect(options.will?.topic).toBe("solar/SITE01/status");
    expect(client.end).toHaveBeenCalled();
    // Nouvelle clé après la révocation.
    expect(csrs[0]).not.toBe(csrs[1]);
    for (const csr of csrs) expect(csr).not.toContain("PRIVATE");
  });

  it("construit les options TLS de l'objet avec le Last Will offline", async () => {
    const identity = await createIdentity("device-site01");
    const options = buildDeviceConnectOptions(CONFIG, identity, "CERT", "CA");
    expect(JSON.parse(String(options.will?.payload))).toEqual({ v: 1, status: "offline" });
    expect(options.will?.retain).toBe(true);
    expect(options.will?.qos).toBe(1);
  });
});
