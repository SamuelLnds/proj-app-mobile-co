import { PUSH_EXCLUDED_ALERT_TYPES, type Alert, type AlertSeverity } from "@solar/contracts";

import { notificationTarget } from "./local";

/** Durée d'affichage du bandeau d'alerte avant sa disparition automatique (ms). */
export const ALERT_BANNER_DURATION_MS = 8000;

/**
 * L'alerte mériterait un push (D033) : gravité `warning` ou `critical`, et type hors de
 * `PUSH_EXCLUDED_ALERT_TYPES` (une consigne refusée est déjà affichée sur l'écran Pilotage).
 */
function isBannerWorthy(alert: Alert): boolean {
  return (
    alert.severity !== "info" &&
    !(PUSH_EXCLUDED_ALERT_TYPES as readonly string[]).includes(alert.type)
  );
}

/**
 * Nouvelles alertes à signaler par le bandeau (#108) : actives, non lues (D034), absentes de la
 * liste précédente et qui mériteraient un push. `previousIds` vaut `null` au premier chargement :
 * les alertes déjà présentes à l'ouverture de l'app ne sont pas signalées.
 */
export function newBannerAlerts(
  previousIds: ReadonlySet<string> | null,
  activeAlerts: readonly Alert[],
  readIds: ReadonlySet<string>,
): Alert[] {
  if (previousIds === null) return [];
  return activeAlerts.filter(
    (alert) =>
      alert.status === "active" &&
      !previousIds.has(alert.id) &&
      !readIds.has(alert.id) &&
      isBannerWorthy(alert),
  );
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { info: 0, warning: 1, critical: 2 };

/** Gravité la plus haute parmi les alertes du bandeau. */
export function highestSeverity(alerts: readonly Alert[]): AlertSeverity {
  return alerts.reduce<AlertSeverity>(
    (max, alert) => (SEVERITY_RANK[alert.severity] > SEVERITY_RANK[max] ? alert.severity : max),
    "info",
  );
}

/**
 * Écran ouvert par « Voir » : même cible que la notification push pour une seule alerte (détail
 * du panneau ou écran Alertes), l'écran Alertes pour plusieurs.
 */
export function bannerTarget(alerts: readonly Alert[]): string {
  const [only] = alerts;
  if (alerts.length !== 1 || !only) return "/alerts";
  return notificationTarget({ panelId: only.panel?.id });
}
