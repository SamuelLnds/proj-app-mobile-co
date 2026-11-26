import type { Alert } from "@solar/contracts";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { useAlerts } from "../api";
import { readResponse, saveResponse } from "../storage";
import { loadNotifications, showLocalNotification, type NotificationsModule } from "./local";

// Pas de doublon entre le push et la notification locale (D030) :
// - le gestionnaire du premier plan n'affiche pas un push dont l'alerte est déjà mémorisée
//   (notifiée localement), et mémorise celle d'un push qu'il affiche : la notification locale
//   suivante n'a pas lieu ;
// - l'app ne notifie localement que les alertes apparues pendant qu'elle est au premier plan.
//   À l'ouverture et au retour au premier plan, les alertes déjà actives sont seulement
//   mémorisées : si elles ont été ouvertes app fermée, le push les a déjà signalées.

/** Clé du stockage local (SQLite) des identifiants d'alertes déjà notifiées. */
export const NOTIFIED_KEY = "notified-alerts";
/** Nombre maximal d'identifiants conservés : les plus anciens sont oubliés (alertes résolues). */
const MAX_REMEMBERED = 200;

/** Titre de la notification, comme celui du message push envoyé par l'API. */
const title = (alert: Alert) => (alert.severity === "critical" ? "Alerte critique" : "Alerte");

/**
 * Parmi les alertes actives, renvoie celles qu'il faut notifier maintenant et mémorise toutes
 * les alertes `warning` et `critical` vues. Une alerte n'est jamais renvoyée deux fois, même
 * après un redémarrage (la mémoire est dans SQLite). Au premier passage (rien de mémorisé),
 * les alertes déjà actives sont seulement mémorisées : pas de rafale de notifications.
 */
export async function takeNewAlerts(
  alerts: Alert[],
  options: { memorizeOnly?: boolean } = {},
): Promise<Alert[]> {
  const relevant = alerts.filter((alert) => alert.severity !== "info");
  const stored = await readResponse<string[]>(NOTIFIED_KEY);
  const known = new Set(stored?.value ?? []);
  const unknown = relevant.filter((alert) => !known.has(alert.id));
  const fresh = stored && !options.memorizeOnly ? unknown : [];
  if (!stored || unknown.length > 0) {
    // Mémorisé avant l'affichage : un plantage entre les deux ne provoque pas de doublon.
    const remembered = [...(stored?.value ?? []), ...relevant.map((a) => a.id)];
    await saveResponse(NOTIFIED_KEY, [...new Set(remembered)].slice(-MAX_REMEMBERED));
  }
  return fresh;
}

/** Les passages se suivent : deux séries d'alertes reçues en même temps ne se doublonnent pas. */
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task);
  queue = next.catch(() => undefined);
  return next;
}

/**
 * Décide si le gestionnaire du premier plan affiche un push reçu app ouverte : non si l'alerte
 * (`alertId` des données du message) est déjà mémorisée, c'est-à-dire déjà notifiée localement.
 * Sinon, elle est mémorisée et le push s'affiche. Sans mémoire (premier passage), le push
 * s'affiche : la première série d'alertes reçue mémorisera l'alerte.
 */
export function shouldShowPush(data: unknown): Promise<boolean> {
  const alertId =
    data && typeof data === "object" ? (data as { alertId?: unknown }).alertId : undefined;
  if (typeof alertId !== "string") return Promise.resolve(true);
  return serialize(async () => {
    const stored = await readResponse<string[]>(NOTIFIED_KEY);
    if (!stored) return true;
    if (stored.value.includes(alertId)) return false;
    await saveResponse(NOTIFIED_KEY, [...stored.value, alertId].slice(-MAX_REMEMBERED));
    return true;
  }).catch(() => true);
}

/** Vrai pour une notification arrivée par le push (et non programmée par l'app). */
function isPush(notification: unknown): boolean {
  const request = (notification as { request?: { trigger?: { type?: unknown } } } | undefined)
    ?.request;
  return request?.trigger?.type === "push";
}

/**
 * Affiche aussi les notifications quand l'app est ouverte, sauf un push dont l'alerte a déjà été
 * notifiée localement (pas de doublon).
 */
export function showNotificationsInForeground(Notifications: NotificationsModule): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification?: { request?: { content?: { data?: unknown } } }) => {
      const show =
        !isPush(notification) || (await shouldShowPush(notification?.request?.content?.data));
      return {
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: show,
        shouldSetBadge: false,
      };
    },
  });
}

/**
 * Affiche une notification locale pour chaque nouvelle alerte `warning` ou `critical`. Sans le
 * module natif ou sans autorisation, rien n'est affiché, en silence ; les alertes sont quand
 * même mémorisées, pour ne pas toutes arriver d'un coup à l'octroi de l'autorisation.
 */
export function notifyNewAlerts(
  alerts: Alert[],
  options: { memorizeOnly?: boolean } = {},
): Promise<void> {
  return serialize(async () => {
    try {
      const fresh = await takeNewAlerts(alerts, options);
      if (fresh.length === 0) return;
      const Notifications = await loadNotifications();
      if (!Notifications || !(await isGranted(Notifications))) return;
      for (const alert of fresh) {
        await showLocalNotification(Notifications, {
          title: title(alert),
          body: alert.message,
          data: { alertId: alert.id, panelId: alert.panel?.id ?? null, type: alert.type },
        });
      }
    } catch {
      // Une notification manquée ne doit jamais gêner l'affichage des alertes.
    }
  });
}

async function isGranted(Notifications: NotificationsModule): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

/**
 * Surveille les alertes actives (déjà interrogées toutes les 5 s par `useAlerts`) et notifie les
 * nouvelles, tant que `enabled` est vrai (utilisateur connecté, source `api`).
 */
export function useLocalAlertNotifications(enabled: boolean): void {
  const alerts = useAlerts("active", { enabled });
  const items = alerts.data?.items;
  const updatedAt = alerts.dataUpdatedAt;
  // Instant où l'app est devenue active, et indicateur de la première série reçue depuis : cette
  // série est seulement mémorisée (les alertes ouvertes app fermée ont été signalées par le push).
  const activeSince = useRef(Date.now());
  const baselineDone = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        activeSince.current = Date.now();
        baselineDone.current = false;
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!enabled) {
      baselineDone.current = false;
      activeSince.current = Date.now();
      return;
    }
    // Série reçue avant le retour au premier plan : périmée, on attend la suivante.
    if (!items || updatedAt < activeSince.current) return;
    const memorizeOnly = !baselineDone.current;
    baselineDone.current = true;
    void notifyNewAlerts(items, { memorizeOnly });
  }, [enabled, items, updatedAt]);
}
