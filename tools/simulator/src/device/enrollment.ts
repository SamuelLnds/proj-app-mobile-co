// Enrôlement de l'objet simulé auprès de l'API (séquence 4.7 de l'UML, D027) : demande, suivi
// par l'empreinte, vérification du certificat. Seules des données publiques sont échangées.
import {
  ENROLLMENT_POLL_PERIOD_S,
  EnrollmentStatusResponseSchema,
  ErrorResponseSchema,
  type EnrollmentStatusResponse,
} from "@solar/contracts";
import { checkCertificate, fingerprintLines, type DeviceIdentity } from "./identity";

/** Délai avant de renouveler une demande refusée par l'API (autre demande en attente, API absente). */
export const ENROLLMENT_RETRY_MS = 15_000;

export interface EnrollmentDeps {
  apiUrl: string;
  fetch: typeof fetch;
  log: (message: string) => void;
  sleep: (ms: number) => Promise<void>;
  /** Vrai quand le simulateur s'arrête : la boucle d'attente se termine. */
  stopped: () => boolean;
}

/** Certificat obtenu, prêt pour la connexion TLS mutuelle. */
export interface IssuedCertificate {
  certificatePem: string;
  expiresAt: Date;
}

/** Erreur de l'API (code et message) ou injoignable. */
async function apiError(response: Response): Promise<string> {
  const parsed = ErrorResponseSchema.safeParse(await response.json().catch(() => null));
  return parsed.success
    ? `${parsed.data.error.code} : ${parsed.data.error.message}`
    : `HTTP ${response.status}`;
}

export function createEnrollmentApi({
  apiUrl,
  fetch: fetchFn,
}: Pick<EnrollmentDeps, "apiUrl" | "fetch">) {
  const base = apiUrl.replace(/\/$/, "");
  const parse = async (response: Response) =>
    EnrollmentStatusResponseSchema.parse(await response.json());
  return {
    /** `POST /v1/enrollments` : renvoie l'état, ou le message d'erreur de l'API. */
    async request(deviceName: string, csr: string): Promise<EnrollmentStatusResponse | string> {
      const response = await fetchFn(`${base}/enrollments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ deviceName, csr }),
      });
      return response.status === 202 ? parse(response) : apiError(response);
    },
    /** `GET /v1/enrollments/{fingerprint}` */
    async status(fingerprint: string): Promise<EnrollmentStatusResponse | string> {
      const response = await fetchFn(`${base}/enrollments/${fingerprint}`, {
        headers: { Accept: "application/json" },
      });
      return response.ok ? parse(response) : apiError(response);
    },
  };
}

/**
 * Demande un certificat et attend la décision de l'exploitant. Renvoie le certificat vérifié, ou
 * `null` si la demande est refusée ou expirée (l'appelant recommence avec une nouvelle clé) ou si
 * le simulateur s'arrête.
 */
export async function enroll(
  deviceName: string,
  identity: DeviceIdentity,
  deps: EnrollmentDeps,
): Promise<IssuedCertificate | null> {
  const api = createEnrollmentApi(deps);
  const attempt = async <T>(call: () => Promise<T>): Promise<T | string> => {
    try {
      return await call();
    } catch (error) {
      return `API injoignable (${error instanceof Error ? error.message : String(error)})`;
    }
  };

  deps.log(`Enrôlement de ${deviceName} : comparez cette empreinte avec celle de l'app.`);
  for (const line of fingerprintLines(identity.fingerprint)) deps.log(`    ${line}`);

  // 1. Demande, renouvelée tant que l'API la refuse (autre demande en attente, API absente).
  for (;;) {
    if (deps.stopped()) return null;
    const result = await attempt(() => api.request(deviceName, identity.csrPem));
    if (typeof result !== "string") break;
    deps.log(
      `Demande refusée par l'API, nouvel essai dans ${ENROLLMENT_RETRY_MS / 1000} s. ${result}`,
    );
    await deps.sleep(ENROLLMENT_RETRY_MS);
  }
  deps.log("Demande envoyée : en attente de l'acceptation par un exploitant.");

  // 2. Suivi par l'empreinte, jusqu'à la décision.
  for (;;) {
    if (deps.stopped()) return null;
    await deps.sleep(ENROLLMENT_POLL_PERIOD_S * 1000);
    const result = await attempt(() => api.status(identity.fingerprint));
    if (typeof result === "string") {
      deps.log(`Suivi impossible, nouvel essai. ${result}`);
      continue;
    }
    if (result.status === "pending") continue;
    if (result.status !== "active" || !result.certificate || !result.certificateExpiresAt) {
      deps.log(
        `Demande ${result.status === "rejected" ? "refusée" : "expirée"} : nouvelle clé et nouvelle demande.`,
      );
      return null;
    }
    // 3. Vérification avant usage : nom commun et clé publique.
    const problem = checkCertificate(result.certificate, deviceName, identity.publicKeyDer);
    if (problem) {
      deps.log(`Certificat rejeté par l'objet : ${problem}. Nouvelle demande.`);
      return null;
    }
    deps.log(`Certificat reçu, valable jusqu'au ${result.certificateExpiresAt}.`);
    return { certificatePem: result.certificate, expiresAt: new Date(result.certificateExpiresAt) };
  }
}
