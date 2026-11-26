// Routes des consignes : HTTP uniquement, la logique est dans le service.
import { ROUTES } from "@solar/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Guards } from "../auth/plugin";
import type { SetpointsService } from "./service";

export function setpointsRoutes(app: FastifyInstance, service: SetpointsService, guards: Guards) {
  const v1 = app.withTypeProvider<ZodTypeProvider>();

  v1.post(
    "/sites/:id/setpoints",
    {
      preHandler: guards.operator,
      schema: {
        params: ROUTES.createSetpoint.params,
        body: ROUTES.createSetpoint.body,
        response: { 202: ROUTES.createSetpoint.response },
      },
    },
    async (request, reply) => {
      const created = await service.create(request.params.id, request.user.sub, request.body);
      return reply.status(202).send(created);
    },
  );

  v1.get(
    "/sites/:id/setpoints",
    {
      preHandler: guards.viewer,
      schema: {
        params: ROUTES.listSetpoints.params,
        querystring: ROUTES.listSetpoints.query,
        response: { 200: ROUTES.listSetpoints.response },
      },
    },
    (request) => service.list(request.params.id, request.query),
  );
}
