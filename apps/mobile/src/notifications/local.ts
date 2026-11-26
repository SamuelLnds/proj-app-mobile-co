import { ALERT_NOTIFICATION_CHANNEL_ID } from "@solar/contracts";
import type * as ExpoDevice from "expo-device";
import type * as ExpoNotifications from "expo-notifications";
import { Platform } from "react-native";

export type NotificationsModule = typeof ExpoNotifications;
export type DeviceModule = typeof ExpoDevice;

/**
 * Modules natifs, chargés à la demande. Remplaçables : le chargement dynamique n'existe pas
 * dans l'environnement de test (jest).
 */
export const nativeModules = {
  notifications: (): Promise<NotificationsModule> => import("expo-notifications"),
  device: (): Promise<DeviceModule> => import("expo-device"),
};

/**
 * Charge expo-notifications à la demande. Le module contient du code natif : une version de
 * l'app installée avant son ajout ne l'a pas, et un import au chargement ferait planter le
 * démarrage. Sans le module, les notifications push sont désactivées en silence
 * (`null`).
 */
export async function loadNotifications(): Promise<NotificationsModule | null> {
  try {
    return await nativeModules.notifications();
  } catch {
    return null;
  }
}

/** Identifiant du canal Android des notifications d'alerte. */
export const ALERT_CHANNEL_ID = ALERT_NOTIFICATION_CHANNEL_ID;

/**
 * Crée le canal Android puis demande l'autorisation d'afficher des notifications (Android 13 et
 * plus), séquence 4.1 de l'UML. Renvoie `false` quand les notifications sont indisponibles :
 * module natif absent, autorisation refusée ou erreur. Ne demande aucun jeton push (voir `push.ts`).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return false;
    if (Platform.OS === "android") {
      // Le canal doit exister avant la demande d'autorisation.
      await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
        name: "Alertes",
        importance: Notifications.AndroidImportance.MAX,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    return status === "granted";
  } catch {
    return false;
  }
}

/**
 * Au premier plan, aucune notification système (D033) : l'alerte est déjà visible dans l'app
 * (badge de l'onglet Alertes, écran Alertes). Le gestionnaire ne s'applique qu'à une notification
 * reçue app ouverte ; il demande de ne rien afficher. Hors premier plan, le système affiche le
 * push sans passer par lui.
 */
export function hideNotificationsInForeground(Notifications: NotificationsModule): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Écran ouvert par l'appui sur une notification : le détail du panneau concerné, sinon
 * l'écran Alertes. Les données sont reçues du système : tout est vérifié.
 */
export function notificationTarget(data: unknown): string {
  const panelId =
    data && typeof data === "object" ? (data as { panelId?: unknown }).panelId : undefined;
  return typeof panelId === "string" && panelId
    ? `/panel/${encodeURIComponent(panelId)}`
    : "/alerts";
}
