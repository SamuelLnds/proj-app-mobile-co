// Routes des panneaux : HTTP uniquement, la logique est dans le service.
import { ROUTES } from "@solar/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Guards } from "../auth/plugin";
import type { PanelsService } from "./service";

export function panelsRoutes(app: FastifyInstance, service: PanelsService, guards: Guards) {
  const v1 = app.withTypeProvider<ZodTypeProvider>();

  v1.get(
    "/sites/:id/panels",
    {
      preHandler: guards.viewer,
      schema: {
        params: ROUTES.listSitePanels.params,
        response: { 200: ROUTES.listSitePanels.response },
      },
    },
    (request) => service.listPanels(request.params.id),
  );

  v1.get(
    "/panels/:id",
    {
      preHandler: guards.viewer,
      schema: { params: ROUTES.getPanel.params, response: { 200: ROUTES.getPanel.response } },
    },
    (request) => service.getPanel(request.params.id),
  );

  v1.patch(
    "/panels/:id",
    {
      preHandler: guards.operator,
      schema: {
        params: ROUTES.updatePanel.params,
        body: ROUTES.updatePanel.body,
        response: { 200: ROUTES.updatePanel.response },
      },
    },
    (request) => service.updatePanel(request.params.id, request.body),
  );

  v1.delete(
    "/panels/:id",
    { preHandler: guards.operator, schema: { params: ROUTES.deletePanel.params } },
    async (request, reply) => {
      await service.deletePanel(request.params.id);
      return reply.status(204).send();
    },
  );
}
