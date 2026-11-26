// Notification des alertes ouvertes (séquence 4.5 de l'UML, D029). Ce module n'a ni route ni
// requête à la base : il compose le message d'une alerte et le confie à la fonction d'envoi
// (client ntfy), d'où l'absence de `routes.ts` et de `repository.ts`.
import { APP_URL_SCHEME } from "@solar/contracts";
import type { AlertRow } from "../alerts/repository";
import type { NtfyMessage, NtfySender } from "./ntfy-client";

export interface NotificationsService {
  /** Faux quand `NTFY_URL` est absent : aucun message n'est alors envoyé. */
  enabled: boolean;
  /**
   * Publie l'alerte sur ntfy si elle est `warning` ou `critical`. Renvoie `true` si un message a
   * été envoyé. Lève l'erreur d'envoi : le moteur d'alertes la journalise sans interrompre le
   * traitement du message.
   */
  notifyAlert: (alert: AlertRow) => Promise<boolean>;
}

/**
 * Contenu du message ntfy : le texte de l'alerte (nom du site ou du panneau, valeurs) et un lien
 * vers l'app. Jamais d'e-mail, de nom d'utilisateur ni d'autre donnée personnelle.
 */
export function alertNotification(alert: AlertRow): NtfyMessage {
  const critical = alert.severity === "critical";
  return {
    title: critical ? "Alerte critique" : "Alerte",
    body: alert.message,
    priority: critical ? "urgent" : "high",
    tags: [critical ? "rotating_light" : "warning", alert.type],
    click: alert.panelId
      ? `${APP_URL_SCHEME}://panel/${alert.panelId}`
      : `${APP_URL_SCHEME}://alerts`,
  };
}

/** `send` à `null` : envoi désactivé (variables `NTFY_*` absentes). */
export function createNotificationsService(send: NtfySender | null): NotificationsService {
  return {
    enabled: send !== null,
    async notifyAlert(alert) {
      if (!send || alert.severity === "info") return false;
      await send(alertNotification(alert));
      return true;
    },
  };
}
