// Envoi des notifications push par le service Expo (`expo-server-sdk`).
import { ALERT_NOTIFICATION_CHANNEL_ID } from "@solar/contracts";
import { Expo, type ExpoPushMessage } from "expo-server-sdk";

/** Notification à envoyer à un téléphone (jeton Expo). */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Identifiants utiles à l'app pour ouvrir le bon écran : jamais de donnée personnelle. */
  data: Record<string, string | null>;
}

/** Résultat de l'envoi d'un message ; `error` reprend le code d'erreur d'Expo. */
export type PushResult = { ok: true } | { ok: false; error: string };

/**
 * Envoi groupé : renvoie un résultat par message, dans le même ordre. Fonction injectable :
 * les tests la remplacent, aucun appel réseau n'y est fait.
 */
export type PushSender = (messages: PushMessage[]) => Promise<PushResult[]>;

/** Code d'erreur d'Expo pour un jeton qui ne reçoit plus rien (application désinstallée…). */
export const DEVICE_NOT_REGISTERED = "DeviceNotRegistered";

/**
 * Envoi réel. Le jeton d'accès Expo est facultatif : sans lui, les notifications partent quand
 * même (il ne sert qu'à renforcer la sécurité du compte Expo).
 */
export function createExpoSender(accessToken?: string): PushSender {
  const expo = new Expo(accessToken ? { accessToken } : {});

  return async (messages) => {
    const results: PushResult[] = messages.map(() => ({ ok: true }));
    const valid: Array<{ index: number; message: ExpoPushMessage }> = [];
    messages.forEach((message, index) => {
      if (Expo.isExpoPushToken(message.to)) {
        valid.push({
          index,
          message: {
            to: message.to,
            title: message.title,
            body: message.body,
            data: message.data,
            sound: "default",
            channelId: ALERT_NOTIFICATION_CHANNEL_ID,
            priority: "high",
          },
        });
      } else {
        // Un jeton qui n'a pas la forme d'un jeton Expo ne recevra jamais rien.
        results[index] = { ok: false, error: DEVICE_NOT_REGISTERED };
      }
    });

    const chunks = expo.chunkPushNotifications(valid.map((entry) => entry.message));
    let offset = 0;
    for (const chunk of chunks) {
      const entries = valid.slice(offset, offset + chunk.length);
      offset += chunk.length;
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((ticket, position) => {
          const entry = entries[position];
          if (entry && ticket.status === "error") {
            results[entry.index] = { ok: false, error: ticket.details?.error ?? "ExpoError" };
          }
        });
      } catch {
        // Lot en échec : ses messages sont comptés en erreur, les autres lots sont envoyés.
        for (const entry of entries) results[entry.index] = { ok: false, error: "SendFailed" };
      }
    }
    return results;
  };
}
