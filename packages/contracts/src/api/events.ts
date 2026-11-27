// Flux d'événements GET /v1/events (bonus #60, D037) : signaux de changement, sans les données.
import { z } from "zod";
import { MESSAGE_VERSION } from "../mqtt/messages";
import { Iso8601UtcSchema } from "../primitives";

/** Ce qui a changé ; l'app relit les requêtes correspondantes (section 7.4 de la cartographie). */
export const StreamTopicSchema = z.enum(["site", "panels", "alerts", "enrollments"]);
export type StreamTopic = z.infer<typeof StreamTopicSchema>;

/** Données d'un événement `change` du flux. */
export const StreamEventSchema = z.object({
  v: z.literal(MESSAGE_VERSION),
  topic: StreamTopicSchema,
  siteCode: z.string().nullable(),
  at: Iso8601UtcSchema,
});
export type StreamEvent = z.infer<typeof StreamEventSchema>;

/** Nom de l'événement SSE porté par chaque signal. */
export const STREAM_EVENT_NAME = "change";
