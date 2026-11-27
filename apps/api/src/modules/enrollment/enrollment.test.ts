import "reflect-metadata";
import { createHash, createPrivateKey, webcrypto } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as x509 from "@peculiar/x509";
import {
  ENROLLMENT_PENDING_TTL_MIN,
  EnrollmentPageSchema,
  EnrollmentSchema,
  EnrollmentStatusResponseSchema,
  ErrorResponseSchema,
  LoginResponseSchema,
} from "@solar/contracts";
import argon2 from "argon2";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../server";
import type { AuthRepository, UserRow } from "../auth/repository";
import { createAuthService } from "../auth/service";
import { createFileAuthority } from "./authority";
import { deviceAcl, type ActiveDevice, type BrokerAccess } from "./broker";
import type { EnrollmentRow, EnrollmentsRepository } from "./repository";
import { createEnrollmentService } from "./service";

x509.cryptoProvider.set(webcrypto as unknown as Crypto);

const START = new Date("2026-11-27T10:00:00Z");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DEVICE = { id: id(1), name: "device-site01", siteCode: "SITE01" };
const OPERATOR = { id: id(10), name: "Exploitant" };
const EC = { name: "ECDSA", namedCurve: "P-256" } as const;
const SHA256_ECDSA = { name: "ECDSA", hash: "SHA-256" } as const;
type Keys = CryptoKeyPair;

const generate = async (): Promise<Keys> =>
  (await webcrypto.subtle.generateKey(EC, true, ["sign", "verify"])) as unknown as Keys;

/** Demande de certificat signée par la clé de l'objet ; `cn` est le nom écrit dans la demande. */
async function makeCsr(keys: Keys, cn = DEVICE.name): Promise<string> {
  const csr = await x509.Pkcs10CertificateRequestGenerator.create({
    name: `CN=${cn}`,
    keys,
    signingAlgorithm: SHA256_ECDSA,
  });
  return csr.toString("pem");
}

async function fingerprintOf(keys: Keys): Promise<string> {
  const spki = await webcrypto.subtle.exportKey("spki", keys.publicKey as webcrypto.CryptoKey);
  return createHash("sha256").update(Buffer.from(spki)).digest("hex");
}

/** Autorité de test, écrite comme celle de « pnpm mqtt:setup » (clé SEC1, certificat auto-signé). */
let caDir: string;
let caCert: x509.X509Certificate;
beforeAll(async () => {
  const caKeys = await generate();
  caCert = await x509.X509CertificateGenerator.createSelfSigned({
    name: "CN=Parc Solaire Devices CA",
    keys: caKeys,
    signingAlgorithm: SHA256_ECDSA,
    notBefore: new Date("2026-01-01T00:00:00Z"),
    notAfter: new Date("2028-01-01T00:00:00Z"),
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true)],
  });
  const pkcs8 = await webcrypto.subtle.exportKey("pkcs8", caKeys.privateKey as webcrypto.CryptoKey);
  const sec1 = createPrivateKey({ key: Buffer.from(pkcs8), format: "der", type: "pkcs8" }).export({
    type: "sec1",
    format: "pem",
  });
  caDir = mkdtempSync(join(tmpdir(), "solar-ca-"));
  writeFileSync(join(caDir, "ca.crt"), caCert.toString("pem"));
  writeFileSync(join(caDir, "ca.key"), sec1);
});

/** Dépôt en mémoire qui reproduit les conditions SQL du dépôt réel. */
function fakeRepository() {
  const rows: EnrollmentRow[] = [];
  let counter = 100;
  const copy = (row: EnrollmentRow | undefined) => (row ? { ...row } : null);
  const repository: EnrollmentsRepository = {
    findDeviceByName: async (name) =>
      name === DEVICE.name ? { id: DEVICE.id, name: DEVICE.name } : null,
    findById: async (enrollmentId) => copy(rows.find((r) => r.id === enrollmentId)),
    findLatestByFingerprint: async (fingerprint) =>
      copy(
        rows
          .filter((r) => r.fingerprint === fingerprint)
          .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0],
      ),
    findPendingForDevice: async (deviceId) =>
      copy(rows.find((r) => r.deviceId === deviceId && r.status === "pending")),
    insertPending: async (enrollment) => {
      if (rows.some((r) => r.deviceId === enrollment.deviceId && r.status === "pending")) {
        return null;
      }
      const row: EnrollmentRow = {
        id: id(counter++),
        ...enrollment,
        status: "pending",
        requestedAt: new Date(
          enrollment.pendingExpiresAt.getTime() - ENROLLMENT_PENDING_TTL_MIN * 60_000,
        ),
        decidedAt: null,
        decidedBy: null,
        serialNumber: null,
        certificatePem: null,
        certificateExpiresAt: null,
        revokedAt: null,
        deviceName: DEVICE.name,
        siteCode: DEVICE.siteCode,
        decidedByName: null,
      };
      rows.push(row);
      return { ...row };
    },
    list: async (limit, status, before) =>
      rows
        .filter((r) => (!status || r.status === status) && (!before || r.requestedAt < before))
        .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
        .slice(0, limit)
        .map((r) => ({ ...r })),
    activate: async (enrollmentId, issued) => {
      const row = rows.find((r) => r.id === enrollmentId && r.status === "pending");
      if (!row) return null;
      for (const other of rows) {
        if (other.deviceId === row.deviceId && other.status === "active") {
          other.status = "revoked";
          other.revokedAt = issued.decidedAt;
        }
      }
      Object.assign(row, { status: "active", ...issued, decidedByName: OPERATOR.name });
      return { ...row };
    },
    reject: async (enrollmentId, decidedBy, decidedAt) => {
      const row = rows.find((r) => r.id === enrollmentId && r.status === "pending");
      if (!row) return null;
      Object.assign(row, {
        status: "rejected",
        decidedBy,
        decidedAt,
        decidedByName: OPERATOR.name,
      });
      return { ...row };
    },
    revoke: async (enrollmentId, revokedAt) => {
      const row = rows.find((r) => r.id === enrollmentId && r.status === "active");
      if (!row) return null;
      Object.assign(row, { status: "revoked", revokedAt });
      return { ...row };
    },
    expire: async (now) => {
      let pending = 0;
      let active = 0;
      for (const row of rows) {
        if (row.status === "pending" && row.pendingExpiresAt < now) {
          row.status = "expired";
          pending++;
        } else if (row.status === "active" && row.certificateExpiresAt! < now) {
          row.status = "expired";
          active++;
        }
      }
      return { pending, active };
    },
    listActiveDevices: async () =>
      rows
        .filter((r) => r.status === "active")
        .map((r) => ({ deviceName: r.deviceName, siteCode: r.siteCode })),
    listRevoked: async () =>
      rows
        .filter((r) => r.status === "revoked")
        .map((r) => ({ serialNumber: r.serialNumber!, revokedAt: r.revokedAt! })),
  };
  return { repository, rows };
}

let USERS: UserRow[];
beforeAll(async () => {
  const passwordHash = await argon2.hash("secret", { type: argon2.argon2id });
  USERS = (["operator", "viewer"] as const).map((role, i) => ({
    id: i === 0 ? OPERATOR.id : id(11),
    email: `${role}@demo.local`,
    name: i === 0 ? OPERATOR.name : "Lecteur",
    role,
    passwordHash,
    createdAt: START,
  }));
});

async function setup({ brokerFails = false } = {}) {
  const fake = fakeRepository();
  const clock = { now: START };
  const applied: Array<{ devices: ActiveDevice[]; crl: string }> = [];
  const errors: string[] = [];
  const broker: BrokerAccess = {
    apply: async (devices, crl) => {
      if (brokerFails) throw new Error("docker absent");
      applied.push({ devices, crl });
    },
  };
  const service = createEnrollmentService(
    fake.repository,
    createFileAuthority(join(caDir, "ca.crt"), join(caDir, "ca.key")),
    broker,
    { error: (details, message) => errors.push(`${message} ${JSON.stringify(details)}`) },
    () => clock.now,
  );
  const auth: AuthRepository = {
    findUserByEmail: async (email) => USERS.find((u) => u.email === email) ?? null,
    findUserById: async (userId) => USERS.find((u) => u.id === userId) ?? null,
  };
  const app = buildServer({
    config: { LOG_LEVEL: "silent", NODE_ENV: "test" },
    checkDatabase: async () => true,
    auth: { service: createAuthService(auth), jwtSecret: "x".repeat(32) },
    enrollment: service,
  });
  /** Corps de toutes les requêtes et réponses d'enrôlement, pour vérifier l'absence de clé privée. */
  const exchanged: string[] = [];
  const call = async (options: {
    method: "GET" | "POST";
    url: string;
    payload?: unknown;
    headers?: Record<string, string>;
  }) => {
    const response = await app.inject(options as never);
    exchanged.push(JSON.stringify(options.payload ?? null), response.body);
    return response;
  };
  const token = async (role: "operator" | "viewer") => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: `${role}@demo.local`, password: "secret" },
    });
    return { authorization: `Bearer ${LoginResponseSchema.parse(response.json()).token}` };
  };
  const operator = await token("operator");
  const request = (csr: string, deviceName = DEVICE.name) =>
    call({ method: "POST", url: "/v1/enrollments", payload: { deviceName, csr } });
  const poll = (fingerprint: string) =>
    call({ method: "GET", url: `/v1/enrollments/${fingerprint}` });
  const decide = (
    enrollmentId: string,
    action: "accept" | "reject" | "revoke",
    payload?: unknown,
  ) =>
    call({
      method: "POST",
      url: `/v1/enrollments/${enrollmentId}/${action}`,
      headers: operator,
      payload: action === "accept" ? (payload ?? {}) : undefined,
    });
  return {
    ...fake,
    app,
    clock,
    applied,
    errors,
    exchanged,
    request,
    poll,
    decide,
    operator,
    viewer: await token("viewer"),
  };
}

const status = (body: unknown) => EnrollmentStatusResponseSchema.parse(body);
const enrollment = (body: unknown) => EnrollmentSchema.parse(body);
const errorCode = (body: unknown) => ErrorResponseSchema.parse(body).error.code;

describe("demande d'enrôlement (POST /v1/enrollments)", () => {
  it("enregistre la demande en attente, renvoie l'empreinte de la clé et aucun certificat", async () => {
    const t = await setup();
    const keys = await generate();
    const response = await t.request(await makeCsr(keys));
    expect(response.statusCode).toBe(202);
    const body = status(response.json());
    expect(body).toEqual({
      fingerprint: await fingerprintOf(keys),
      status: "pending",
      pendingExpiresAt: new Date(
        START.getTime() + ENROLLMENT_PENDING_TTL_MIN * 60_000,
      ).toISOString(),
      certificate: null,
      certificateExpiresAt: null,
    });
    expect(t.rows).toHaveLength(1);
  });

  it("refuse une demande illisible, mal signée ou d'une clé qui n'est pas P-256 (422 INVALID_CSR)", async () => {
    const t = await setup();
    const garbage =
      "-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----\n";
    expect(errorCode((await t.request(garbage)).json())).toBe("INVALID_CSR");

    const rsaKeys = (await webcrypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    )) as unknown as Keys;
    const rsaCsr = await x509.Pkcs10CertificateRequestGenerator.create({
      name: `CN=${DEVICE.name}`,
      keys: rsaKeys,
      signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as Algorithm,
    });
    const rsa = await t.request(rsaCsr.toString("pem"));
    expect(rsa.statusCode).toBe(422);
    expect(errorCode(rsa.json())).toBe("INVALID_CSR");

    // Demande d'une clé, signée par une autre : la possession de la clé n'est pas prouvée.
    const owner = await generate();
    const other = await generate();
    const forged = await x509.Pkcs10CertificateRequestGenerator.create({
      name: `CN=${DEVICE.name}`,
      keys: { publicKey: owner.publicKey, privateKey: other.privateKey },
      signingAlgorithm: SHA256_ECDSA,
    });
    expect(errorCode((await t.request(forged.toString("pem"))).json())).toBe("INVALID_CSR");
    expect(t.rows).toHaveLength(0);
  });

  it("refuse un corps invalide (422 INVALID_REQUEST) et un objet inconnu (404)", async () => {
    const t = await setup();
    const invalid = await t.request("pas un CSR");
    expect(invalid.statusCode).toBe(422);
    expect(errorCode(invalid.json())).toBe("INVALID_REQUEST");
    const unknown = await t.request(await makeCsr(await generate()), "device-site99");
    expect(unknown.statusCode).toBe(404);
  });

  it("refuse une seconde demande d'une autre clé pour le même objet, accepte la même renvoyée", async () => {
    const t = await setup();
    const first = await makeCsr(await generate());
    const created = status((await t.request(first)).json());
    const again = await t.request(first);
    expect(again.statusCode).toBe(202);
    expect(status(again.json())).toEqual(created);

    const duplicate = await t.request(await makeCsr(await generate()));
    expect(duplicate.statusCode).toBe(409);
    expect(errorCode(duplicate.json())).toBe("ENROLLMENT_PENDING");
    expect(t.rows).toHaveLength(1);
  });

  it("fait expirer une demande non traitée après 30 min, puis en accepte une nouvelle", async () => {
    const t = await setup();
    const keys = await generate();
    await t.request(await makeCsr(keys));
    t.clock.now = new Date(START.getTime() + (ENROLLMENT_PENDING_TTL_MIN * 60 + 1) * 1000);
    expect(status((await t.poll(await fingerprintOf(keys))).json()).status).toBe("expired");
    expect((await t.request(await makeCsr(await generate()))).statusCode).toBe(202);
  });

  it("limite les demandes à 10 par minute et par adresse IP", async () => {
    const t = await setup();
    const csr = await makeCsr(await generate());
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await t.request(csr)).statusCode);
    expect(codes.slice(0, 10).every((code) => code === 202)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe("suivi par l'objet (GET /v1/enrollments/{fingerprint})", () => {
  it("renvoie l'état sans certificat tant que la demande n'est pas acceptée, 404 si inconnue", async () => {
    const t = await setup();
    const keys = await generate();
    await t.request(await makeCsr(keys));
    const pending = status((await t.poll(await fingerprintOf(keys))).json());
    expect(pending.status).toBe("pending");
    expect(pending.certificate).toBeNull();
    expect((await t.poll("0".repeat(64))).statusCode).toBe(404);
    expect((await t.poll("pas-une-empreinte")).statusCode).toBe(422);
  });
});

describe("décisions de l'exploitant", () => {
  async function pendingEnrollment(t: Awaited<ReturnType<typeof setup>>, cn?: string) {
    const keys = await generate();
    await t.request(await makeCsr(keys, cn));
    return { keys, fingerprint: await fingerprintOf(keys), id: t.rows.at(-1)!.id };
  }

  it("réserve la liste et les décisions au rôle operator (401 sans jeton, 403 pour un lecteur)", async () => {
    const t = await setup();
    const { id: enrollmentId } = await pendingEnrollment(t);
    expect((await t.app.inject({ method: "GET", url: "/v1/enrollments" })).statusCode).toBe(401);
    for (const action of ["accept", "reject", "revoke"]) {
      const response = await t.app.inject({
        method: "POST",
        url: `/v1/enrollments/${enrollmentId}/${action}`,
        headers: t.viewer,
        payload: {},
      });
      expect(response.statusCode).toBe(403);
      expect(errorCode(response.json())).toBe("FORBIDDEN");
    }
    const list = await t.app.inject({ method: "GET", url: "/v1/enrollments", headers: t.viewer });
    expect(list.statusCode).toBe(403);
    expect(t.rows[0]!.status).toBe("pending");
  });

  it("liste les demandes pour l'exploitant, filtrées par état", async () => {
    const t = await setup();
    await pendingEnrollment(t);
    const response = await t.app.inject({
      method: "GET",
      url: "/v1/enrollments?status=pending",
      headers: t.operator,
    });
    const page = EnrollmentPageSchema.parse(response.json());
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.deviceName).toBe(DEVICE.name);
  });

  it("acceptation : certificat signé par l'autorité, nom commun imposé, 8 h, droits dans l'ACL", async () => {
    const t = await setup();
    // Le CSR prétend être un autre objet : le nom approuvé l'emporte.
    const { fingerprint, id: enrollmentId, keys } = await pendingEnrollment(t, "device-pirate");
    const response = await t.decide(enrollmentId, "accept");
    expect(response.statusCode).toBe(200);
    const accepted = enrollment(response.json());
    expect(accepted.status).toBe("active");
    expect(accepted.decidedBy).toEqual(OPERATOR);
    expect(accepted.certificateExpiresAt).toBe(
      new Date(START.getTime() + 8 * 3_600_000).toISOString(),
    );

    const polled = status((await t.poll(fingerprint)).json());
    expect(polled.status).toBe("active");
    const certificate = new x509.X509Certificate(polled.certificate!);
    expect(certificate.subject).toBe(`CN=${DEVICE.name}`);
    expect(certificate.issuer).toBe(caCert.subject);
    expect(await certificate.verify({ publicKey: caCert.publicKey, date: START })).toBe(true);
    expect(certificate.serialNumber).toBe(accepted.serialNumber);
    const ownKey = Buffer.from(
      await webcrypto.subtle.exportKey("spki", keys.publicKey as webcrypto.CryptoKey),
    );
    expect(Buffer.from(certificate.publicKey.rawData).equals(ownKey)).toBe(true);
    const usage = certificate.getExtension(x509.ExtendedKeyUsageExtension);
    expect(usage?.usages).toEqual([x509.ExtendedKeyUsage.clientAuth]);

    expect(t.applied.at(-1)!.devices).toEqual([{ deviceName: DEVICE.name, siteCode: "SITE01" }]);
  });

  it("accepte une durée choisie et refuse plus de 48 h", async () => {
    const t = await setup();
    const { id: enrollmentId } = await pendingEnrollment(t);
    expect((await t.decide(enrollmentId, "accept", { ttlHours: 49 })).statusCode).toBe(422);
    const accepted = enrollment((await t.decide(enrollmentId, "accept", { ttlHours: 48 })).json());
    expect(accepted.certificateExpiresAt).toBe(
      new Date(START.getTime() + 48 * 3_600_000).toISOString(),
    );
  });

  it("refus : aucun certificat, et la demande ne peut plus être acceptée (409)", async () => {
    const t = await setup();
    const { fingerprint, id: enrollmentId } = await pendingEnrollment(t);
    expect(enrollment((await t.decide(enrollmentId, "reject")).json()).status).toBe("rejected");
    const polled = status((await t.poll(fingerprint)).json());
    expect(polled).toMatchObject({ status: "rejected", certificate: null });
    const accept = await t.decide(enrollmentId, "accept");
    expect(accept.statusCode).toBe(409);
    expect(errorCode(accept.json())).toBe("INVALID_ENROLLMENT_STATE");
    expect(t.applied).toHaveLength(0);
    expect((await t.decide(id(999), "reject")).statusCode).toBe(404);
  });

  it("révocation : droits retirés de l'ACL, numéro de série dans la liste de révocation", async () => {
    const t = await setup();
    const { fingerprint, id: enrollmentId } = await pendingEnrollment(t);
    const { serialNumber } = enrollment((await t.decide(enrollmentId, "accept")).json());
    const response = await t.decide(enrollmentId, "revoke");
    expect(response.statusCode).toBe(200);
    expect(enrollment(response.json()).status).toBe("revoked");

    const last = t.applied.at(-1)!;
    expect(last.devices).toEqual([]);
    // Étiquette et fin de ligne exigées par OpenSSL : sinon le broker refuse de démarrer.
    expect(last.crl.startsWith("-----BEGIN X509 CRL-----\n")).toBe(true);
    expect(last.crl.endsWith("-----END X509 CRL-----\n")).toBe(true);
    const crl = new x509.X509Crl(last.crl);
    expect(crl.entries.map((entry) => entry.serialNumber)).toEqual([serialNumber]);
    expect(await crl.verify({ publicKey: caCert.publicKey })).toBe(true);
    expect(status((await t.poll(fingerprint)).json())).toMatchObject({
      status: "revoked",
      certificate: null,
    });
    expect(errorCode((await t.decide(enrollmentId, "revoke")).json())).toBe(
      "INVALID_ENROLLMENT_STATE",
    );
  });

  it("un nouvel enrôlement accepté révoque le certificat précédent du même objet", async () => {
    const t = await setup();
    const first = await pendingEnrollment(t);
    const { serialNumber: oldSerial } = enrollment((await t.decide(first.id, "accept")).json());
    const second = await pendingEnrollment(t);
    await t.decide(second.id, "accept");
    expect(t.rows.find((r) => r.id === first.id)!.status).toBe("revoked");
    const last = t.applied.at(-1)!;
    expect(last.devices).toHaveLength(1);
    expect(new x509.X509Crl(last.crl).entries.map((e) => e.serialNumber)).toEqual([oldSerial]);
  });

  it("broker injoignable : décision enregistrée, réponse 503 BROKER_UNAVAILABLE, erreur journalisée", async () => {
    const t = await setup({ brokerFails: true });
    const { id: enrollmentId } = await pendingEnrollment(t);
    const response = await t.decide(enrollmentId, "accept");
    expect(response.statusCode).toBe(503);
    expect(errorCode(response.json())).toBe("BROKER_UNAVAILABLE");
    expect(t.rows[0]!.status).toBe("active");
    expect(t.errors).toHaveLength(1);
  });

  it("aucune requête ni réponse ne contient de clé privée, ni les logs la clé de l'autorité", async () => {
    const t = await setup({ brokerFails: true });
    const { fingerprint, id: enrollmentId } = await pendingEnrollment(t);
    await t.decide(enrollmentId, "accept");
    await t.poll(fingerprint);
    await t.decide(enrollmentId, "revoke");
    expect(t.exchanged.length).toBeGreaterThan(6);
    for (const body of t.exchanged) expect(body).not.toContain("PRIVATE");
    const caKey = readFileSync(join(caDir, "ca.key"), "utf8");
    for (const line of t.errors) {
      expect(line).not.toContain("PRIVATE");
      expect(line).not.toContain(caKey.split("\n")[1]);
    }
  });
});

describe("ACL des objets", () => {
  it("donne à chaque objet actif les droits de son site, et rien sans objet", () => {
    expect(deviceAcl([])).not.toContain("user ");
    expect(deviceAcl([{ deviceName: "device-site01", siteCode: "SITE01" }])).toContain(
      [
        "user device-site01",
        "topic write solar/SITE01/measurements",
        "topic write solar/SITE01/status",
        "topic write solar/SITE01/state",
        "topic read solar/SITE01/setpoint",
      ].join("\n"),
    );
  });
});
