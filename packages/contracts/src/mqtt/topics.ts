// Construction et analyse des topics MQTT (section 6.1 de docs/conception/03-cartographie-technique.md).

/** Code d'un site : 3 à 16 caractères, majuscules et chiffres (ex. `SITE01`). */
export const SITE_CODE_PATTERN = /^[A-Z0-9]{3,16}$/;
/** Code d'un panneau : `P` suivi de 2 ou 3 chiffres (ex. `P07`). */
export const PANEL_CODE_PATTERN = /^P[0-9]{2,3}$/;

/** Abonnements de l'API (caractères génériques MQTT). */
export const API_SUBSCRIPTIONS = [
  "solar/+/measurements",
  "solar/+/panels/+/measurements",
  "solar/+/state",
  "solar/+/status",
] as const;

function assertSiteCode(siteCode: string): void {
  if (!SITE_CODE_PATTERN.test(siteCode)) {
    throw new Error(`Code de site invalide : "${siteCode}" (attendu : ${SITE_CODE_PATTERN})`);
  }
}

function assertPanelCode(panelCode: string): void {
  if (!PANEL_CODE_PATTERN.test(panelCode)) {
    throw new Error(`Code de panneau invalide : "${panelCode}" (attendu : ${PANEL_CODE_PATTERN})`);
  }
}

/** `solar/{siteCode}/measurements` */
export function siteMeasurementsTopic(siteCode: string): string {
  assertSiteCode(siteCode);
  return `solar/${siteCode}/measurements`;
}

/** `solar/{siteCode}/panels/{panelCode}/measurements` */
export function panelMeasurementsTopic(siteCode: string, panelCode: string): string {
  assertSiteCode(siteCode);
  assertPanelCode(panelCode);
  return `solar/${siteCode}/panels/${panelCode}/measurements`;
}

/** `solar/{siteCode}/setpoint` */
export function setpointTopic(siteCode: string): string {
  assertSiteCode(siteCode);
  return `solar/${siteCode}/setpoint`;
}

/** `solar/{siteCode}/state` */
export function stateTopic(siteCode: string): string {
  assertSiteCode(siteCode);
  return `solar/${siteCode}/state`;
}

/** `solar/{siteCode}/status` */
export function statusTopic(siteCode: string): string {
  assertSiteCode(siteCode);
  return `solar/${siteCode}/status`;
}

/** Nature d'un topic reconnu. */
export type TopicKind =
  "site-measurements" | "panel-measurements" | "setpoint" | "state" | "status";

/** Résultat de l'analyse d'un topic reçu : succès avec les codes extraits, ou erreur explicite. */
export type ParsedTopic =
  | { ok: true; kind: Exclude<TopicKind, "panel-measurements">; siteCode: string }
  | { ok: true; kind: "panel-measurements"; siteCode: string; panelCode: string }
  | { ok: false; error: string };

const SITE_LEVEL_KINDS = {
  measurements: "site-measurements",
  setpoint: "setpoint",
  state: "state",
  status: "status",
} as const;

/** Analyse un topic reçu et en extrait le code du site (et du panneau le cas échéant). */
export function parseTopic(topic: string): ParsedTopic {
  const parts = topic.split("/");
  if (parts[0] !== "solar") {
    return { ok: false, error: `Topic invalide "${topic}" : il doit commencer par "solar/"` };
  }
  const siteCode = parts[1] ?? "";
  if (!SITE_CODE_PATTERN.test(siteCode)) {
    return { ok: false, error: `Topic invalide "${topic}" : code de site "${siteCode}" incorrect` };
  }

  if (parts.length === 3) {
    const leaf = parts[2] ?? "";
    if (Object.hasOwn(SITE_LEVEL_KINDS, leaf)) {
      return { ok: true, kind: SITE_LEVEL_KINDS[leaf as keyof typeof SITE_LEVEL_KINDS], siteCode };
    }
    return { ok: false, error: `Topic invalide "${topic}" : ressource "${leaf}" inconnue` };
  }

  if (parts.length === 5 && parts[2] === "panels" && parts[4] === "measurements") {
    const panelCode = parts[3] ?? "";
    if (!PANEL_CODE_PATTERN.test(panelCode)) {
      return {
        ok: false,
        error: `Topic invalide "${topic}" : code de panneau "${panelCode}" incorrect`,
      };
    }
    return { ok: true, kind: "panel-measurements", siteCode, panelCode };
  }

  return { ok: false, error: `Topic invalide "${topic}" : structure non reconnue` };
}
