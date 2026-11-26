import { useRootNavigationState, useRouter } from "expo-router";
import { useEffect } from "react";

import { useAuth } from "../auth/AuthProvider";
import { dataSource } from "../data";
import { hideNotificationsInForeground, loadNotifications, notificationTarget } from "./local";

/** Notifications déjà traitées : un appui n'ouvre l'écran qu'une fois, même après un remontage. */
const handled = new Set<string>();

/**
 * Notifications push, tant que l'utilisateur est connecté (source `api` seulement) : rien n'est
 * affiché app au premier plan (D033), et l'appui sur une notification (app fermée ou en
 * arrière-plan) ouvre l'écran Alertes ou le détail du panneau. N'affiche rien lui-même.
 */
export function NotificationEffects() {
  const router = useRouter();
  const navigationKey = useRootNavigationState()?.key;
  const { user } = useAuth();
  const active = !!user && !!navigationKey && dataSource.kind === "api";

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const subscriptions: { remove: () => void }[] = [];

    void loadNotifications().then(async (Notifications) => {
      if (!Notifications || cancelled) return;
      hideNotificationsInForeground(Notifications);
      const open = (response: {
        notification: { request: { identifier: string; content: { data?: unknown } } };
      }) => {
        const { identifier, content } = response.notification.request;
        if (handled.has(identifier)) return;
        handled.add(identifier);
        router.push(notificationTarget(content.data) as never);
      };
      subscriptions.push(Notifications.addNotificationResponseReceivedListener(open));
      // App lancée par l'appui sur une notification.
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last && !cancelled) open(last);
    });

    return () => {
      cancelled = true;
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [active, router]);

  return null;
}
