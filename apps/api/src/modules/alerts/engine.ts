// Moteur de règles d'alerte (section 6 de l'UML, séquence 4.5) : point unique d'ouverture et
// de résolution des alertes. Les autres modules (consignes, objets) passent par `open` et
// `resolve` ; les mesures sont évaluées par `evaluateSiteMeasurement` et
// `evaluatePanelMeasurement`.
import {
  BATTERY_FULL_PCT,
  BATTERY_FULL_RESOLVED_PCT,
  BATTERY_LOW_PCT,
  BATTERY_LOW_RESOLVED_PCT,
  DEVICE_SILENCE_TIMEOUT_S,
  LOW_PRODUCTION_DURATION_S,
  LOW_PRODUCTION_RATIO,
  LOW_PRODUCTION_RESOLVED_RATIO,
  MIN_IRRADIANCE_FOR_ALERT_W_M2,
  OVERHEATING_C,
  OVERHEATING_RESOLVED_C,
  type AlertType,
  type PanelMeasurement,
  type SiteMeasurement,
} from "@solar/contracts";
import type { FastifyBaseLogger } from "fastify";
import type { AlertRow, AlertsRepository, NewAlert } from "./repository";

/** Portée d'une alerte : le site, ou l'un de ses panneaux. */
export interface AlertScope {
  siteId: string;
  panelId?: string | null;
}

/** Envoi de la notification d'une alerte ouverte (push Expo, D030) ; une erreur est journalisée sans effet sur le traitement. */
export type AlertNotifier = (alert: AlertRow) => Promise<void>;

/** Ce que les autres modules utilisent du moteur. */
export interface AlertSink {
  /** Ouvre l'alerte sauf s'il en existe déjà une active identique ; `true` si elle a été ouverte. */
  open: (alert: NewAlert) => Promise<boolean>;
  /** Résout les alertes actives de ces types sur la portée donnée. */
  resolve: (scope: AlertScope, types: AlertType[], endedAt: Date) => Promise<void>;
}

export interface AlertEngine extends AlertSink {
  /** Mesure du site : surchauffe, batterie, production basse du site. */
  evaluateSiteMeasurement: (
    siteCode: string,
    message: SiteMeasurement,
    receivedAt: Date,
  ) => Promise<void>;
  /** Mesure d'un panneau : surchauffe et production basse du panneau. */
  evaluatePanelMeasurement: (
    siteCode: string,
    panelCode: string,
    message: PanelMeasurement,
    receivedAt: Date,
  ) => Promise<void>;
  /** L'objet du site est passé hors ligne. */
  deviceOffline: (siteId: string) => Promise<void>;
  /** L'objet du site est de nouveau en ligne. */
  deviceOnline: (siteId: string, at: Date) => Promise<void>;
}

/** Action décidée par une règle pour une mesure : ouvrir, résoudre ou ne rien faire. */
type Decision = "open" | "resolve" | "none";

/** Règle à seuils avec hystérésis : entre les deux seuils, l'état en cours est conservé. */
export function thresholdDecision(triggered: boolean, resolved: boolean): Decision {
  if (triggered) return "open";
  if (resolved) return "resolve";
  return "none";
}

const round = (value: number) => Math.round(value);

export function createAlertEngine(
  repository: AlertsRepository,
  notify: AlertNotifier,
  logger: FastifyBaseLogger,
  /** Appelé quand une alerte s'ouvre ou se résout (flux d'événements, bonus #60). */
  onChange: () => void = () => undefined,
): AlertEngine {
  /**
   * Début de la période de production basse en cours, par site ou panneau. En mémoire : un
   * redémarrage de l'API relance le décompte des 60 s, au pire un léger retard.
   */
  const lowSince = new Map<string, { since: number; lastSeen: number }>();
  /** Dernier ensoleillement connu par site : les panneaux n'ont pas de capteur (section 6). */
  const irradiance = new Map<string, number>();

  /** Vrai quand la production est basse en continu depuis `LOW_PRODUCTION_DURATION_S`. */
  function sustainedLow(key: string, low: boolean, now: number): boolean {
    if (!low) {
      lowSince.delete(key);
      return false;
    }
    const entry = lowSince.get(key);
    // Un trou dans les mesures (objet silencieux) interrompt la continuité.
    if (!entry || now - entry.lastSeen > DEVICE_SILENCE_TIMEOUT_S * 1000) {
      lowSince.set(key, { since: now, lastSeen: now });
      return false;
    }
    entry.lastSeen = now;
    return now - entry.since >= LOW_PRODUCTION_DURATION_S * 1000;
  }

  async function open(alert: NewAlert): Promise<boolean> {
    const row = await repository.insert(alert);
    if (!row) return false; // Déjà active : pas de doublon, pas de nouvelle notification.
    logger.info({ type: row.type, severity: row.severity }, "Alerte ouverte");
    onChange();
    if (row.severity !== "info") {
      try {
        await notify(row);
      } catch (error) {
        // Une panne d'envoi ne doit jamais perturber le traitement du message.
        logger.error({ err: error, type: row.type }, "Notification de l'alerte impossible");
      }
    }
    return true;
  }

  async function resolve(scope: AlertScope, types: AlertType[], endedAt: Date): Promise<void> {
    if (types.length === 0) return;
    const count = await repository.resolve(scope.siteId, scope.panelId ?? null, types, endedAt);
    if (count > 0) {
      logger.info({ types, count }, "Alertes résolues");
      onChange();
    }
  }

  /** Applique les décisions de plusieurs règles : une résolution groupée, puis les ouvertures. */
  async function apply(
    scope: AlertScope,
    endedAt: Date,
    decisions: Array<{ alert: Omit<NewAlert, "siteId" | "panelId">; decision: Decision }>,
  ) {
    await resolve(
      scope,
      decisions.filter((d) => d.decision === "resolve").map((d) => d.alert.type),
      endedAt,
    );
    for (const { alert, decision } of decisions) {
      if (decision === "open")
        await open({ ...alert, siteId: scope.siteId, panelId: scope.panelId });
    }
  }

  return {
    open,
    resolve,

    async evaluateSiteMeasurement(siteCode, message, receivedAt) {
      const site = await repository.findSiteByCode(siteCode);
      if (!site) return;
      irradiance.set(site.id, message.irradiance);

      const expected = message.irradiance * site.productionFactor;
      const lowTriggered =
        message.irradiance > MIN_IRRADIANCE_FOR_ALERT_W_M2 &&
        message.production < LOW_PRODUCTION_RATIO * expected;
      const lowResolved =
        message.irradiance <= MIN_IRRADIANCE_FOR_ALERT_W_M2 ||
        message.production >= LOW_PRODUCTION_RESOLVED_RATIO * expected;
      const lowDecision: Decision = lowResolved
        ? "resolve"
        : sustainedLow(`site:${site.id}`, lowTriggered, receivedAt.getTime())
          ? "open"
          : "none";
      if (lowResolved) lowSince.delete(`site:${site.id}`);

      await apply({ siteId: site.id }, receivedAt, [
        {
          decision: lowDecision,
          alert: {
            type: "low_production",
            severity: "warning",
            message: `Production basse sur ${site.name} : ${round(message.production)} W au lieu de ${round(expected)} W attendus`,
          },
        },
        {
          decision: thresholdDecision(
            message.temperature > OVERHEATING_C,
            message.temperature < OVERHEATING_RESOLVED_C,
          ),
          alert: {
            type: "overheating",
            severity: "critical",
            message: `Surchauffe sur ${site.name} : ${round(message.temperature)} °C`,
          },
        },
        {
          decision: thresholdDecision(
            message.batteryLevel <= BATTERY_LOW_PCT,
            message.batteryLevel >= BATTERY_LOW_RESOLVED_PCT,
          ),
          alert: {
            type: "battery_low",
            severity: "warning",
            message: `Batterie faible sur ${site.name} : ${round(message.batteryLevel)} %`,
          },
        },
        {
          decision: thresholdDecision(
            message.batteryLevel >= BATTERY_FULL_PCT,
            message.batteryLevel <= BATTERY_FULL_RESOLVED_PCT,
          ),
          alert: {
            type: "battery_full",
            severity: "info",
            message: `Batterie pleine sur ${site.name} : la charge est suspendue`,
          },
        },
      ]);
    },

    async evaluatePanelMeasurement(siteCode, panelCode, message, receivedAt) {
      const site = await repository.findSiteByCode(siteCode);
      if (!site) return;
      const panel = await repository.findPanel(site.id, panelCode);
      if (!panel) return;

      const decisions: Array<{
        alert: Omit<NewAlert, "siteId" | "panelId">;
        decision: Decision;
      }> = [
        {
          decision: thresholdDecision(
            message.temperature > OVERHEATING_C,
            message.temperature < OVERHEATING_RESOLVED_C,
          ),
          alert: {
            type: "overheating",
            severity: "critical",
            message: `Surchauffe sur ${panel.name} : ${round(message.temperature)} °C`,
          },
        },
      ];

      const sun = irradiance.get(site.id) ?? (await repository.latestIrradiance(site.id));
      if (sun !== null) {
        const expected = (sun * panel.ratedPowerW) / 1000;
        const key = `panel:${panel.id}`;
        const lowResolved =
          sun <= MIN_IRRADIANCE_FOR_ALERT_W_M2 ||
          message.production >= LOW_PRODUCTION_RESOLVED_RATIO * expected;
        const lowTriggered =
          sun > MIN_IRRADIANCE_FOR_ALERT_W_M2 &&
          message.production < LOW_PRODUCTION_RATIO * expected;
        if (lowResolved) lowSince.delete(key);
        decisions.push({
          decision: lowResolved
            ? "resolve"
            : sustainedLow(key, lowTriggered, receivedAt.getTime())
              ? "open"
              : "none",
          alert: {
            type: "low_production",
            severity: "warning",
            message: `Production basse sur ${panel.name} : ${round(message.production)} W au lieu de ${round(expected)} W attendus`,
          },
        });
      }

      await apply({ siteId: site.id, panelId: panel.id }, receivedAt, decisions);
    },

    async deviceOffline(siteId) {
      const site = await repository.findSiteById(siteId);
      if (!site) return;
      await open({
        siteId,
        type: "device_offline",
        severity: "critical",
        message: `L'objet du site ${site.name} est hors ligne`,
      });
    },

    async deviceOnline(siteId, at) {
      await resolve({ siteId }, ["device_offline"], at);
    },
  };
}
