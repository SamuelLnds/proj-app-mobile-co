// Jetons push et notifications d'alerte (séquences 4.1 et 4.5 de l'UML).
import { PUSH_EXCLUDED_ALERT_TYPES, type RegisterPushTokenRequest } from "@solar/contracts";
import type { AlertRow } from "../alerts/repository";
import type { PushTokensRepository } from "./repository";
import { DEVICE_NOT_REGISTERED, type PushMessage, type PushSender } from "./sender";

export interface PushService {
  /** `POST /v1/push-tokens` : enregistre ou réattribue le jeton. */
  register: (userId: string, body: RegisterPushTokenRequest) => Promise<void>;
  /** `DELETE /v1/push-tokens/{token}` : sans effet si le jeton n'existe pas ou n'est plus le sien. */
  remove: (userId: string, token: string) => Promise<void>;
  /**
   * Notifie tous les téléphones enregistrés de l'ouverture d'une alerte `warning` ou `critical`,
   * sauf pour les types de `PUSH_EXCLUDED_ALERT_TYPES` (`setpoint_rejected`, D033) : l'alerte est
   * créée et visible dans l'app, mais sans push. Renvoie le nombre de notifications envoyées et de jetons supprimés.
   */
  notifyAlert: (alert: AlertRow) => Promise<{ sent: number; removed: number }>;
}

/**
 * Contenu de la notification : le texte de l'alerte (nom du site ou du panneau, valeurs) et des
 * identifiants. Jamais d'e-mail, de nom d'utilisateur ni d'autre donnée personnelle.
 */
export function alertNotification(alert: AlertRow): Omit<PushMessage, "to"> {
  return {
    title: alert.severity === "critical" ? "Alerte critique" : "Alerte",
    body: alert.message,
    data: {
      alertId: alert.id,
      siteId: alert.siteId,
      panelId: alert.panelId,
      type: alert.type,
    },
  };
}

export function createPushService(repository: PushTokensRepository, send: PushSender): PushService {
  return {
    register: (userId, body) => repository.upsert(userId, body.token, body.platform),

    remove: (userId, token) => repository.remove(userId, token),

    async notifyAlert(alert) {
      if (alert.severity === "info") return { sent: 0, removed: 0 };
      // Le refus d'une consigne est déjà affiché à l'exploitant par l'écran Pilotage (D033).
      if ((PUSH_EXCLUDED_ALERT_TYPES as readonly string[]).includes(alert.type)) {
        return { sent: 0, removed: 0 };
      }
      const tokens = await repository.listTokens();
      if (tokens.length === 0) return { sent: 0, removed: 0 };

      const content = alertNotification(alert);
      const results = await send(tokens.map((to) => ({ to, ...content })));

      // Un jeton refusé par Expo ne servira plus : il est supprimé.
      const invalid = tokens.filter((_, i) => {
        const result = results[i];
        return result && !result.ok && result.error === DEVICE_NOT_REGISTERED;
      });
      await repository.removeTokens(invalid);
      return { sent: tokens.length - invalid.length, removed: invalid.length };
    },
  };
}
