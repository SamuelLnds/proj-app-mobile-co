// Route du flux d'événements : HTTP uniquement (réponse text/event-stream), la logique est dans
// le service. Le JWT est vérifié comme pour les autres routes (en-tête Authorization).
import { STREAM_HEARTBEAT_S } from "@solar/contracts";
import type { FastifyInstance } from "fastify";
import type { Guards } from "../auth/plugin";
import {
  createCoalescer,
  formatSse,
  SSE_HEARTBEAT,
  STREAM_COALESCE_MS,
  type EventBus,
} from "./service";

/** Délai de reconnexion conseillé au client (ms), champ `retry` du protocole SSE. */
const SSE_RETRY_MS = 3000;

export interface EventsRouteOptions {
  heartbeatMs?: number;
  coalesceMs?: number;
}

export function eventsRoutes(
  app: FastifyInstance,
  bus: EventBus,
  guards: Guards,
  {
    heartbeatMs = STREAM_HEARTBEAT_S * 1000,
    coalesceMs = STREAM_COALESCE_MS,
  }: EventsRouteOptions = {},
) {
  app.get("/events", { preHandler: guards.viewer }, async (request, reply) => {
    // La réponse reste ouverte : Fastify ne la termine pas lui-même.
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Un proxy (Caddy sur le VPS) ne doit pas retenir les événements.
      "X-Accel-Buffering": "no",
    });
    raw.write(`retry: ${SSE_RETRY_MS}\n\n`);

    const coalescer = createCoalescer((event) => raw.write(formatSse(event)), coalesceMs);
    const unsubscribe = bus.subscribe((event) => coalescer.push(event));
    const heartbeat = setInterval(() => raw.write(SSE_HEARTBEAT), heartbeatMs);
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      coalescer.stop();
      unsubscribe();
    });
  });
}
