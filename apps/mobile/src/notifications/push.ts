import type { RegisterPushTokenRequest } from "@solar/contracts";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { loadNotifications, nativeModules, requestNotificationPermission } from "./local";

/** Journalise pourquoi le push est indisponible (jamais le jeton lui-même) et renvoie `null`. */
function unavailable(reason: string): null {
  console.warn(`[push] Push indisponible : ${reason}`);
  return null;
}

/**
 * Demande l'autorisation d'afficher des notifications puis obtient le jeton push Expo du
 * téléphone (séquence 4.1 de l'UML, D030). Renvoie `null` quand le push est indisponible :
 * module natif absent (app installée avant leur ajout), émulateur, autorisation refusée, projet
 * EAS inconnu, configuration Firebase absente du build ou erreur. L'app fonctionne alors avec les
 * seules notifications locales.
 */
export async function registerForPush(): Promise<RegisterPushTokenRequest | null> {
  try {
    // Le canal et l'autorisation servent aussi aux notifications locales.
    if (!(await requestNotificationPermission())) return unavailable("autorisation refusée");
    const Notifications = await loadNotifications();
    if (!Notifications) return unavailable("module expo-notifications absent de cette version");
    const Device = await nativeModules.device();
    // Les émulateurs ne reçoivent pas de notification push.
    if (!Device.isDevice) return unavailable("émulateur");
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return unavailable("projectId EAS introuvable");

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token: data, platform: Platform.OS === "ios" ? "ios" : "android" };
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "erreur inconnue");
  }
}
