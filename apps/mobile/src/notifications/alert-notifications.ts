import type { Alert } from "@solar/contracts";
import { useEffect } from "react";

import { useAlerts } from "../api";
import { readResponse, saveResponse } from "../storage";
import { loadNotifications, showLocalNotification, type NotificationsModule } from "./local";

/** Clé du stockage local (SQLite) des identifiants d'alertes déjà notifiées. */
export const NOTIFIED_KEY = "notified-alerts";
/** Nombre maximal d'identifiants conservés : les plus anciens sont oubliés (alertes résolues). */
const MAX_REMEMBERED = 200;

/** Titre de la notification, comme celui du message ntfy envoyé par l'API. */
const title = (alert: Alert) => (alert.severity === "critical" ? "Alerte critique" : "Alerte");

/**
 * Parmi les alertes actives, renvoie celles qu'il faut notifier maintenant et mémorise toutes
 * les alertes `warning` et `critical` vues. Une alerte n'est jamais renvoyée deux fois, même
 * après un redémarrage (la mémoire est dans SQLite). Au premier passage (rien de mémorisé),
 * les alertes déjà actives sont seulement mémorisées : pas de rafale de notifications.
 */
export async function takeNewAlerts(alerts: Alert[]): Promise<Alert[]> {
  const relevant = alerts.filter((alert) => alert.severity !== "info");
  const stored = await readResponse<string[]>(NOTIFIED_KEY);
  const known = new Set(stored?.value ?? []);
  const fresh = stored ? relevant.filter((alert) => !known.has(alert.id)) : [];
  if (!stored || fresh.length > 0) {
    // Mémorisé avant l'affichage : un plantage entre les deux ne provoque pas de doublon.
    const remembered = [...(stored?.value ?? []), ...relevant.map((a) => a.id)];
    await saveResponse(NOTIFIED_KEY, [...new Set(remembered)].slice(-MAX_REMEMBERED));
  }
  return fresh;
}

/** Les passages se suivent : deux séries d'alertes reçues en même temps ne se doublonnent pas. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Affiche une notification locale pour chaque nouvelle alerte `warning` ou `critical`. Sans le
 * module natif ou sans autorisation, rien n'est affiché, en silence ; les alertes sont quand
 * même mémorisées, pour ne pas toutes arriver d'un coup à l'octroi de l'autorisation.
 */
export function notifyNewAlerts(alerts: Alert[]): Promise<void> {
  const run = async () => {
    try {
      const fresh = await takeNewAlerts(alerts);
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
  };
  const next = queue.then(run);
  queue = next;
  return next;
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
  useEffect(() => {
    if (enabled && items) void notifyNewAlerts(items);
  }, [enabled, items]);
}
