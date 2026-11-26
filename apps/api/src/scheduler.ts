// Planificateur : tâches périodiques de l'API (objets silencieux, délai de réponse aux consignes).
import type { FastifyBaseLogger } from "fastify";
import type { DevicesService } from "./modules/devices/service";
import type { SetpointsService } from "./modules/setpoints/service";

/** Fréquence de vérification : bien plus courte que les délais de 30 s et 60 s surveillés. */
export const SCHEDULER_PERIOD_MS = 10_000;

export function startScheduler(
  devices: DevicesService,
  setpoints: SetpointsService,
  logger: FastifyBaseLogger,
  now: () => Date = () => new Date(),
): () => void {
  const tick = () => {
    const report = (error: unknown) => logger.error({ err: error }, "Erreur du planificateur");
    devices.checkSilence(now()).catch(report);
    setpoints
      .checkResponseTimeouts(now())
      .then((count) => {
        if (count > 0) logger.warn({ count }, "Consignes sans réponse de l'objet");
      })
      .catch(report);
  };
  // Premier passage immédiat : rattrape les consignes restées `sent` pendant un arrêt de l'API.
  tick();
  const timer = setInterval(tick, SCHEDULER_PERIOD_MS);
  return () => clearInterval(timer);
}
