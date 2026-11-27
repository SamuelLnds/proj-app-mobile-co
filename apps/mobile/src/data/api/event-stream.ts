import {
  STREAM_EVENT_NAME,
  STREAM_HEARTBEAT_S,
  StreamEventSchema,
  type StreamEvent,
} from "@solar/contracts";

/**
 * Client Server-Sent Events minimal sur XMLHttpRequest (bonus #60, D037) : React Native n'a pas
 * d'EventSource, et XMLHttpRequest reçoit le texte au fil de l'eau avec l'en-tête du JWT.
 */

export interface EventStreamHandlers {
  onOpen: () => void;
  onEvent: (event: StreamEvent) => void;
  /** Flux terminé (erreur, fin, refus, battements manqués) ; appelé une seule fois. */
  onClose: (reason: string) => void;
}

/** Sans aucun octet reçu pendant deux battements, le flux est considéré coupé. */
export const STREAM_SILENCE_MS = 2 * STREAM_HEARTBEAT_S * 1000;

/**
 * Découpe le texte reçu en blocs SSE (séparés par une ligne vide) et garde la fin incomplète.
 * Renvoie les données des événements `change` valides ; commentaires et autres champs ignorés.
 */
export function parseSse(buffer: string): { events: StreamEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: StreamEvent[] = [];
  for (const block of blocks) {
    let name = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator === -1 ? line : line.slice(0, separator);
      const value = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
      if (field === "event") name = value;
      else if (field === "data") data.push(value);
    }
    if (name !== STREAM_EVENT_NAME || data.length === 0) continue;
    try {
      const parsed = StreamEventSchema.safeParse(JSON.parse(data.join("\n")));
      if (parsed.success) events.push(parsed.data);
    } catch {
      // Données illisibles : l'événement est ignoré, le flux continue.
    }
  }
  return { events, rest };
}

type XhrLike = Pick<
  XMLHttpRequest,
  "open" | "setRequestHeader" | "send" | "abort" | "readyState" | "status" | "responseText"
> & {
  onreadystatechange: (() => void) | null;
  onprogress: (() => void) | null;
  onerror: (() => void) | null;
};

/** Ouvre le flux ; renvoie la fonction qui le ferme (sans appeler `onClose`). */
export function openEventStream(
  url: string,
  token: string,
  handlers: EventStreamHandlers,
  createXhr: () => XhrLike = () => new XMLHttpRequest() as unknown as XhrLike,
): () => void {
  const xhr = createXhr();
  let read = 0;
  let buffer = "";
  let opened = false;
  let finished = false;
  let silence: ReturnType<typeof setTimeout> | null = null;

  const finish = (reason: string) => {
    if (finished) return;
    finished = true;
    if (silence) clearTimeout(silence);
    xhr.onreadystatechange = null;
    xhr.onprogress = null;
    xhr.onerror = null;
    xhr.abort();
    handlers.onClose(reason);
  };
  const watch = () => {
    if (silence) clearTimeout(silence);
    silence = setTimeout(() => finish("battements manqués"), STREAM_SILENCE_MS);
  };
  const consume = () => {
    if (finished) return;
    if (!opened && xhr.readyState >= 2) {
      if (xhr.status !== 200) {
        finish(`refusé (HTTP ${xhr.status})`);
        return;
      }
      opened = true;
      handlers.onOpen();
    }
    const text = xhr.responseText ?? "";
    if (text.length > read) {
      buffer += text.slice(read);
      read = text.length;
      watch();
      const { events, rest } = parseSse(buffer);
      buffer = rest;
      for (const event of events) handlers.onEvent(event);
    }
    if (xhr.readyState === 4) finish(opened ? "flux terminé" : "connexion impossible");
  };

  xhr.onreadystatechange = consume;
  xhr.onprogress = consume;
  xhr.onerror = () => finish("erreur réseau");
  xhr.open("GET", url);
  xhr.setRequestHeader("Accept", "text/event-stream");
  xhr.setRequestHeader("Authorization", `Bearer ${token}`);
  xhr.send();
  watch();

  return () => {
    finished = true;
    if (silence) clearTimeout(silence);
    xhr.onreadystatechange = null;
    xhr.onprogress = null;
    xhr.onerror = null;
    xhr.abort();
  };
}
