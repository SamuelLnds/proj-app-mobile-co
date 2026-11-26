import type { RegisterPushTokenRequest } from "@solar/contracts";
import Constants from "expo-constants";
import type * as ExpoNotifications from "expo-notifications";
import { Platform } from "react-native";

export type NotificationsModule = typeof ExpoNotifications;

/**
 * Modules natifs, chargés à la demande. Remplaçables : le chargement dynamique n'existe pas
 * dans l'environnement de test (jest).
 */
export const nativeModules = {
  notifications: (): Promise<NotificationsModule> => import("expo-notifications"),
  device: () => import("expo-device"),
};

/**
 * Charge expo-notifications à la demande. Le module contient du code natif : une version de
 * l'app installée avant son ajout ne l'a pas, et un import au chargement ferait planter le
 * démarrage. Sans le module, les notifications sont désactivées en silence (`null`).
 */
export async function loadNotifications(): Promise<NotificationsModule | null> {
  try {
    return await nativeModules.notifications();
  } catch {
    return null;
  }
}

/** Identifiant du canal Android des notifications d'alerte. */
export const ALERT_CHANNEL_ID = "default";

/**
 * Demande l'autorisation d'afficher des notifications puis obtient le jeton Expo du téléphone
 * (séquence 4.1 de l'UML). Renvoie `null` quand les notifications sont indisponibles : module
 * natif absent, émulateur, autorisation refusée, projet EAS inconnu ou erreur.
 */
export async function registerForPush(): Promise<RegisterPushTokenRequest | null> {
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return null;
    const Device = await nativeModules.device();
    // Les émulateurs ne reçoivent pas de notification push.
    if (!Device.isDevice) return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return null;

    if (Platform.OS === "android") {
      // Le canal doit exister avant la demande d'autorisation (Android 13 et plus).
      await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
        name: "Alertes",
        importance: Notifications.AndroidImportance.MAX,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return null;

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token: data, platform: Platform.OS === "ios" ? "ios" : "android" };
  } catch {
    return null;
  }
}

/** Affiche aussi les notifications reçues quand l'app est ouverte. */
export function showNotificationsInForeground(Notifications: NotificationsModule): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Écran ouvert par l'appui sur une notification : le détail du panneau concerné, sinon
 * l'écran Alertes. Les données viennent du service Expo : tout est vérifié.
 */
export function notificationTarget(data: unknown): string {
  const panelId =
    data && typeof data === "object" ? (data as { panelId?: unknown }).panelId : undefined;
  return typeof panelId === "string" && panelId
    ? `/panel/${encodeURIComponent(panelId)}`
    : "/alerts";
}
