// Équivalence entre les textes d'enrôlement du firmware (include/enrollment_text.h, compilé sur le
// poste) et le simulateur / les contrats : empreinte au format de l'app, corps de la demande accepté
// par EnrollmentRequestSchema, lecture des réponses EnrollmentStatusResponse, dates ISO.
// Sans compilateur C++ (poste Windows nu), ces tests sont ignorés ; la CI en dispose.
import { createHash } from "node:crypto";
import {
  EnrollmentRequestSchema,
  EnrollmentStatusResponseSchema,
  EnrollmentStatusSchema,
} from "@solar/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createIdentity, fingerprintLines } from "../src/device/identity";
import { compileProgram, findCompiler, type CompiledProgram } from "./helpers/cpp";

const compiler = findCompiler();
const itWithCompiler = compiler ? it : it.skip;

const CERTIFICATE =
  "-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIQ\nAbc/def+ghi==\n-----END CERTIFICATE-----\n";

describe("textes d'enrôlement du firmware", () => {
  let program: CompiledProgram | null = null;
  beforeAll(() => {
    if (compiler) program = compileProgram(compiler, "test/enrollment/dump_enrollment.cpp");
  });
  afterAll(() => program?.dispose());

  itWithCompiler("affiche l'empreinte comme le simulateur et l'app", () => {
    for (const seed of ["a", "device-site01", "autre clé"]) {
      const hex = createHash("sha256").update(seed).digest("hex");
      const [printed, ...lines] = program!.run(["fingerprint", hex]);
      expect(printed).toBe(hex);
      expect(lines).toEqual(fingerprintLines(hex));
    }
  });

  itWithCompiler(
    "écrit un corps de demande accepté par le schéma, avec le CSR intact",
    async () => {
      const { csrPem } = await createIdentity("device-site01");
      const [body, small] = program!.run(["request", "device-site01"], csrPem);
      const parsed = EnrollmentRequestSchema.parse(JSON.parse(body!));
      expect(parsed).toEqual({ deviceName: "device-site01", csr: csrPem });
      expect(small).toBe("refused");
    },
  );

  itWithCompiler("lit l'état et le certificat d'une réponse de l'API", () => {
    for (const status of EnrollmentStatusSchema.options) {
      const active = status === "active";
      const response = EnrollmentStatusResponseSchema.parse({
        fingerprint: "a".repeat(64),
        status,
        pendingExpiresAt: "2026-11-27T10:30:00.000Z",
        certificate: active ? CERTIFICATE : null,
        certificateExpiresAt: active ? "2026-11-27T18:05:00.000Z" : null,
      });
      const lines = program!.run(["parse"], JSON.stringify(response));
      expect(lines[0]).toBe(status);
      if (active) {
        const start = lines.indexOf("-----certificate-----");
        const end = lines.indexOf("-----end-----");
        expect(lines.slice(start + 1, end).join("\n") + "\n").toBe(CERTIFICATE);
        expect(Number(lines[end + 1])).toBe(Date.parse("2026-11-27T18:05:00.000Z") / 1000);
      } else {
        expect(lines.slice(1)).toEqual(["no-certificate", "no-expiry"]);
      }
    }
    expect(program!.run(["parse"], '{"error":{"code":"NOT_FOUND"}}')[0]).toBe("unknown");
  });

  itWithCompiler("convertit les dates ISO comme Date.parse", () => {
    for (const iso of [
      "1970-01-01T00:00:00.000Z",
      "2026-11-27T18:05:00.000Z",
      "2028-02-29T23:59:59Z",
      "2099-12-31T12:00:00.000Z",
    ]) {
      expect(Number(program!.run(["iso", iso])[0])).toBe(Date.parse(iso) / 1000);
    }
    expect(Number(program!.run(["iso", "pas une date"])[0])).toBe(0);
  });
});
