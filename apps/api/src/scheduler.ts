// Planificateur : tâches périodiques de l'API (objets silencieux ; délais des consignes à venir).
import type { FastifyBaseLogger } from "fastify";
import type { DevicesService } from "./modules/devices/service";

/** Fréquence de vérification : bien plus courte que le délai de silence de 60 s. */
export const SCHEDULER_PERIOD_MS = 10_000;

export function startScheduler(
  devices: DevicesService,
  logger: FastifyBaseLogger,
  now: () => Date = () => new Date(),
): () => void {
  const timer = setInterval(() => {
    devices.checkSilence(now()).catch((error: unknown) => {
      logger.error({ err: error }, "Erreur du planificateur");
    });
  }, SCHEDULER_PERIOD_MS);
  return () => clearInterval(timer);
}
