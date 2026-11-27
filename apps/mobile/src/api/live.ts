import type { StreamTopic } from "@solar/contracts";
import { useQueryClient, type Query, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { useAuth } from "../auth/AuthProvider";
import { dataSource } from "../data";
import { isForeground } from "./app-focus";
import { useConnectivity } from "./connectivity";

/**
 * Flux d'événements (bonus #60, D037) : tant qu'il est ouvert, chaque signal fait relire aussitôt
 * les requêtes concernées et l'interrogation périodique passe à 60 s. S'il se coupe, elle reprend
 * aussitôt et le flux est rouvert, de 3 s à 30 s d'attente entre deux essais.
 */

/** Interrogation de secours tant que le flux est ouvert (ms). */
export const LIVE_FALLBACK_MS = 60_000;
export const RECONNECT_MIN_MS = 3_000;
export const RECONNECT_MAX_MS = 30_000;

let live = false;
const listeners = new Set<() => void>();

function setLive(value: boolean) {
  if (live === value) return;
  live = value;
  for (const listener of listeners) listener();
}

export function isLive(): boolean {
  return live;
}

/** Période d'interrogation d'une requête : `normalMs`, ou le filet de 60 s si le flux est ouvert. */
export function liveInterval(normalMs: number): number {
  return live ? Math.max(normalMs, LIVE_FALLBACK_MS) : normalMs;
}

/** Le flux est-il ouvert ? (pour l'afficher ou le tester) */
export function useIsLive(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => live,
  );
}

/** Requêtes à relire pour chaque signal (clés de `queryKeys`, hooks.ts). */
const MATCHES: Record<StreamTopic, (key: readonly unknown[]) => boolean> = {
  // Sites et site : la courbe du site garde son propre rythme (agrégée par quart d'heure).
  site: (key) => key[0] === "sites" && key.length <= 2,
  panels: (key) =>
    (key[0] === "sites" && key[2] === "panels") || (key[0] === "panels" && key.length === 2),
  alerts: (key) => key[0] === "alerts",
  enrollments: (key) => key[0] === "enrollments",
};

export function invalidateTopic(client: QueryClient, topic: StreamTopic): Promise<void> {
  return client.invalidateQueries({ predicate: (query: Query) => MATCHES[topic](query.queryKey) });
}

function useForeground(): boolean {
  const [foreground, setForeground] = useState(() => AppState.currentState !== "background");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) =>
      setForeground(isForeground(status)),
    );
    return () => subscription.remove();
  }, []);
  return foreground;
}

/**
 * Ouvre le flux tant que l'utilisateur est connecté, l'app au premier plan et le téléphone en
 * ligne (source `api` seulement). Ne dessine rien.
 */
export function LiveUpdates() {
  const client = useQueryClient();
  const { user } = useAuth();
  const { online } = useConnectivity();
  const foreground = useForeground();
  const wanted = !!user && online && foreground && dataSource.kind === "api";

  useEffect(() => {
    if (!wanted) return;
    let stopped = false;
    let close: (() => void) | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let delay = RECONNECT_MIN_MS;

    const connect = () => {
      if (stopped) return;
      close = dataSource.openEventStream({
        onOpen: () => {
          delay = RECONNECT_MIN_MS;
          setLive(true);
          // Données à jour dès l'ouverture, et nouvelles périodes d'interrogation.
          void client.invalidateQueries();
        },
        onEvent: (event) => void invalidateTopic(client, event.topic),
        onClose: () => {
          close = null;
          if (live) {
            setLive(false);
            // L'interrogation périodique reprend tout de suite, sans attendre le filet de 60 s.
            void client.invalidateQueries();
          }
          if (stopped) return;
          retry = setTimeout(connect, delay);
          delay = Math.min(delay * 2, RECONNECT_MAX_MS);
        },
      });
    };
    connect();

    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      close?.();
      if (live) {
        setLive(false);
        void client.invalidateQueries();
      }
    };
  }, [wanted, client]);

  return null;
}
