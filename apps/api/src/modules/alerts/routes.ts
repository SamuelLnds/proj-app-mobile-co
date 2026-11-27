// Route des alertes : HTTP uniquement, la logique est dans le service.
import { ROUTES } from "@solar/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Guards } from "../auth/plugin";
import type { AlertsService } from "./service";

export function alertsRoutes(app: FastifyInstance, service: AlertsService, guards: Guards) {
  const v1 = app.withTypeProvider<ZodTypeProvider>();

  v1.get(
    "/alerts",
    {
      preHandler: guards.viewer,
      schema: {
        querystring: ROUTES.listAlerts.query,
        response: { 200: ROUTES.listAlerts.response },
      },
    },
    (request) => service.list(request.query),
  );
}
