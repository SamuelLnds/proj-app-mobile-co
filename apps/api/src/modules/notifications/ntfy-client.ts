// Client HTTP du serveur ntfy auto-hébergé (D029) : une publication = une requête POST.
// Aucune dépendance : `fetch` est fourni par Node. La fonction d'envoi est injectable, les tests
// n'appellent jamais le réseau.

/** Message à publier sur le sujet des alertes. */
export interface NtfyMessage {
  /** Titre : ASCII uniquement (il voyage dans un en-tête HTTP). */
  title: string;
  /** Corps : texte de l'alerte, en français. Jamais de donnée personnelle. */
  body: string;
  /** Priorité ntfy : `high` pour une alerte `warning`, `urgent` pour une alerte `critical`. */
  priority: "high" | "urgent";
  /** Étiquettes ntfy (gravité, type d'alerte). */
  tags: string[];
  /** Lien ouvert à l'appui sur la notification (schéma `solar://`). */
  click: string;
}

/** Envoi d'un message : lève une erreur si le serveur ne l'a pas accepté. */
export type NtfySender = (message: NtfyMessage) => Promise<void>;

export interface NtfyOptions {
  /** Adresse du serveur, sans le sujet (`NTFY_URL`). */
  url: string;
  /** Sujet des alertes (`NTFY_TOPIC`). */
  topic: string;
  /** Jeton de publication, en écriture seule (`NTFY_TOKEN`). */
  token: string;
  /** Délai maximal d'une requête (ms) : un serveur muet ne bloque pas le traitement des mesures. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

export function createNtfySender(options: NtfyOptions, fetchFn: typeof fetch = fetch): NtfySender {
  const endpoint = `${options.url.replace(/\/+$/, "")}/${encodeURIComponent(options.topic)}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (message) => {
    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.token}`,
        Title: message.title,
        Priority: message.priority,
        Tags: message.tags.join(","),
        Click: message.click,
      },
      body: message.body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      // Le message d'erreur ne reprend jamais le jeton ni le corps de la requête.
      throw new Error(`Le serveur ntfy a refusé la publication (HTTP ${response.status})`);
    }
  };
}
