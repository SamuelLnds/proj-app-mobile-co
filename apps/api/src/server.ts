// Création de l'instance Fastify : validation Zod, gestionnaire d'erreurs unique, routes sous /v1.
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { HealthResponseSchema } from "@solar/contracts";
import type { ErrorDetail, HealthResponse } from "@solar/contracts";
import type { Config } from "./config";
import { AppError, errorBody } from "./errors";
import { registerJwt, requireRole, type Guards } from "./modules/auth/plugin";
import { alertsRoutes } from "./modules/alerts/routes";
import type { AlertsService } from "./modules/alerts/service";
import { authRoutes } from "./modules/auth/routes";
import type { AuthService } from "./modules/auth/service";
import { historyRoutes } from "./modules/history/routes";
import type { HistoryService } from "./modules/history/service";
import { panelsRoutes } from "./modules/panels/routes";
import type { PanelsService } from "./modules/panels/service";
import { setpointsRoutes } from "./modules/setpoints/routes";
import type { SetpointsService } from "./modules/setpoints/service";
import { pushRoutes } from "./modules/notifications/routes";
import type { PushService } from "./modules/notifications/service";
import { sitesRoutes } from "./modules/sites/routes";
import { enrollmentRoutes } from "./modules/enrollment/routes";
import type { EnrollmentService } from "./modules/enrollment/service";
import type { SitesService } from "./modules/sites/service";

export interface ServerDependencies {
  config: Pick<Config, "LOG_LEVEL" | "NODE_ENV">;
  /** Renvoie true si la base répond. */
  checkDatabase: () => Promise<boolean>;
  /** Renvoie true si le client MQTT est connecté ; absent tant que le client n'existe pas. */
  checkBroker?: () => boolean;
  /**
   * Authentification : sans elle (tests de modules isolés), les routes ne sont pas protégées.
   * Le point d'entrée de l'API la fournit toujours.
   */
  auth?: { service: AuthService; jwtSecret: string };
  /** Services métier ; un module absent n'expose pas ses routes. */
  sites?: SitesService;
  panels?: PanelsService;
  history?: HistoryService;
  setpoints?: SetpointsService;
  alerts?: AlertsService;
  push?: PushService;
  enrollment?: EnrollmentService;
}

export function buildServer({
  config,
  checkDatabase,
  checkBroker,
  auth,
  sites,
  panels,
  history,
  setpoints,
  alerts,
  push,
  enrollment,
}: ServerDependencies) {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // Logs lisibles en développement seulement ; JSON ailleurs.
      ...(config.NODE_ENV === "development" && {
        transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss" } },
      }),
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Limitation de débit activée route par route (connexion, routes publiques de l'enrôlement).
  void app.register(rateLimit, { global: false });
  if (auth) void registerJwt(app, auth.jwtSecret);

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send(errorBody("NOT_FOUND", "La route demandée n'existe pas."));
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send(errorBody(error.code, error.message, error.details));
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const details: ErrorDetail[] = error.validation.map((issue) => ({
        field: issue.instancePath.replace(/^\//, "").replaceAll("/", ".") || "(racine)",
        message: issue.message ?? "Valeur invalide",
      }));
      return reply.status(422).send(errorBody("INVALID_REQUEST", undefined, details));
    }

    // Erreurs HTTP émises par Fastify lui-même (corps JSON illisible, limite de débit…).
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      if (status === 429) return reply.status(429).send(errorBody("TOO_MANY_ATTEMPTS"));
      return reply.status(422).send(errorBody("INVALID_REQUEST"));
    }

    // Erreur inattendue : le détail reste dans les logs, jamais dans la réponse.
    request.log.error({ err: error }, "Erreur inattendue");
    return reply.status(500).send(errorBody("INTERNAL_ERROR"));
  });

  app.register(
    async (v1) => {
      v1.get("/health", { schema: { response: { 200: HealthResponseSchema } } }, async () => {
        const databaseUp = await checkDatabase().catch(() => false);
        const brokerUp = checkBroker?.() ?? false;
        const body: HealthResponse = {
          status: databaseUp && brokerUp ? "ok" : "degraded",
          database: databaseUp ? "up" : "down",
          broker: brokerUp ? "up" : "down",
        };
        return body;
      });

      if (auth) authRoutes(v1, auth.service);
      const guards: Guards = auth
        ? { viewer: [requireRole("viewer")], operator: [requireRole("operator")] }
        : { viewer: [], operator: [] };
      if (sites) sitesRoutes(v1, { service: sites, authenticate: guards.viewer[0] });
      if (panels) panelsRoutes(v1, panels, guards);
      if (history) historyRoutes(v1, history, guards);
      if (setpoints) setpointsRoutes(v1, setpoints, guards);
      if (alerts) alertsRoutes(v1, alerts, guards);
      if (push) pushRoutes(v1, push, guards);
      if (enrollment) enrollmentRoutes(v1, enrollment, guards);
    },
    { prefix: "/v1" },
  );

  return app;
}
