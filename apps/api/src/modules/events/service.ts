// Flux d'événements (bonus #60, D037) : bus en mémoire qui reçoit les changements des autres
// modules, regroupement par fenêtre de temps et format Server-Sent Events. Aucune donnée n'est
// transportée : seulement le `topic` qui a changé.
import {
  MESSAGE_VERSION,
  STREAM_EVENT_NAME,
  type StreamEvent,
  type StreamTopic,
} from "@solar/contracts";

/** Fenêtre de regroupement des événements d'un même `topic` (ms) : bien sous les 2 s exigées. */
export const STREAM_COALESCE_MS = 250;

export type StreamListener = (event: StreamEvent) => void;

export interface EventBus {
  /** Signale un changement ; sans abonné, ne fait rien. */
  publish: (topic: StreamTopic, siteCode?: string | null) => void;
  /** Abonne un flux ; renvoie la fonction de désabonnement. */
  subscribe: (listener: StreamListener) => () => void;
  /** Nombre de flux ouverts. */
  size: () => number;
}

export function createEventBus(now: () => Date = () => new Date()): EventBus {
  const listeners = new Set<StreamListener>();
  return {
    publish(topic, siteCode = null) {
      if (listeners.size === 0) return;
      const event: StreamEvent = { v: MESSAGE_VERSION, topic, siteCode, at: now().toISOString() };
      for (const listener of listeners) listener(event);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    size: () => listeners.size,
  };
}

/** Un événement au format Server-Sent Events. */
export function formatSse(event: StreamEvent): string {
  return `event: ${STREAM_EVENT_NAME}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Commentaire SSE de battement, ignoré par les clients. */
export const SSE_HEARTBEAT = ": ping\n\n";

/**
 * Regroupe les événements d'un même `topic` et d'un même site arrivés pendant `windowMs` : le
 * dernier est envoyé à la fin de la fenêtre ouverte par le premier.
 */
export function createCoalescer(send: StreamListener, windowMs = STREAM_COALESCE_MS) {
  const pending = new Map<string, StreamEvent>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const events = [...pending.values()];
    pending.clear();
    for (const event of events) send(event);
  };
  return {
    push(event: StreamEvent) {
      pending.set(`${event.topic}:${event.siteCode ?? ""}`, event);
      if (!timer) timer = setTimeout(flush, windowMs);
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending.clear();
    },
  };
}
