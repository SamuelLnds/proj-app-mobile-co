// Création de l'instance Fastify : validation Zod, gestionnaire d'erreurs unique, routes sous /v1.
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

export interface ServerDependencies {
  config: Pick<Config, "LOG_LEVEL" | "NODE_ENV">;
  /** Renvoie true si la base répond. */
  checkDatabase: () => Promise<boolean>;
  /** Renvoie true si le client MQTT est connecté ; absent tant que le client n'existe pas. */
  checkBroker?: () => boolean;
}

export function buildServer({ config, checkDatabase, checkBroker }: ServerDependencies) {
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
    },
    { prefix: "/v1" },
  );

  return app;
}
